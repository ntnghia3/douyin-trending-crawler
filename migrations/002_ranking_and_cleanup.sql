-- Migration: add viral ranking columns, index, and cleanup function
-- Run in Supabase SQL editor or via psql

BEGIN;

-- 1) Add columns if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='videos' AND column_name='viral_score'
  ) THEN
    ALTER TABLE public.videos
      ADD COLUMN viral_score numeric NULL,
      ADD COLUMN last_increase_at timestamptz NULL,
      ADD COLUMN max_viral_score numeric NULL,
      ADD COLUMN marked_for_deletion boolean NOT NULL DEFAULT false,
      ADD COLUMN deleted_at timestamptz NULL,
      -- New columns for momentum tracking
      ADD COLUMN viral_momentum numeric DEFAULT 0, -- tốc độ tăng gần đây
      ADD COLUMN momentum_24h numeric DEFAULT 0, -- tăng trong 24h qua
      ADD COLUMN momentum_7d numeric DEFAULT 0, -- tăng trong 7 ngày qua
      ADD COLUMN viral_score_history jsonb DEFAULT '[]'::jsonb, -- lịch sử điểm [{"score":10,"timestamp":"2024-..."}]
      ADD COLUMN surge_detected boolean DEFAULT false, -- có tăng đột biến không
      ADD COLUMN surge_factor numeric DEFAULT 1, -- hệ số tăng đột biến (2x, 3x...)
      ADD COLUMN last_surge_at timestamptz NULL; -- thời điểm tăng đột biến gần nhất
  END IF;
END
$$;

-- 2) Create index to support ordering by surge priority, viral momentum, then score
CREATE INDEX IF NOT EXISTS idx_videos_surge_momentum_score ON public.videos (
  surge_detected DESC, 
  viral_momentum DESC NULLS LAST, 
  viral_score DESC NULLS LAST, 
  created_at DESC
);

-- Backup index for simple viral score ordering
CREATE INDEX IF NOT EXISTS idx_videos_viral_score_created_at ON public.videos (viral_score DESC NULLS LAST, created_at DESC);

-- 3) Create cleanup function that deletes old videos whose viral_score hasn't increased
--    Parameters:
--      p_days_no_increase: number of days since last increase (or since created_at if never increased)
--      p_min_score: minimum viral_score threshold; only delete if current viral_score < p_min_score
--      p_age_days: minimum age of record (created_at) to consider deleting
CREATE OR REPLACE FUNCTION public.cleanup_old_low_viral(
  p_days_no_increase integer DEFAULT 14,
  p_min_score numeric DEFAULT 10,
  p_age_days integer DEFAULT 7
) RETURNS integer
  LANGUAGE plpgsql
AS $$
DECLARE
  del_count integer := 0;
BEGIN
  -- Delete rows that meet the criteria and return how many were deleted.
  WITH candidates AS (
    SELECT id FROM public.videos
    WHERE COALESCE(last_increase_at, created_at) <= now() - (p_days_no_increase || ' days')::interval
      AND COALESCE(viral_score, 0) < p_min_score
      AND created_at <= now() - (p_age_days || ' days')::interval
  ), deleted AS (
    DELETE FROM public.videos v
    USING candidates c
    WHERE v.id = c.id
    RETURNING v.id
  )
  SELECT count(*) INTO del_count FROM deleted;

  RETURN del_count;
END;
$$;

COMMIT;

-- Helper function to update viral metrics and detect surges
CREATE OR REPLACE FUNCTION public.update_viral_metrics(
  p_video_id uuid,
  p_new_score numeric
) RETURNS void
  LANGUAGE plpgsql
AS $$
DECLARE
  v_current_score numeric;
  v_history jsonb;
  v_momentum_24h numeric := 0;
  v_momentum_7d numeric := 0;
  v_surge_factor numeric := 1;
  v_surge_detected boolean := false;
  v_now timestamptz := now();
BEGIN
  -- Get current data
  SELECT viral_score, viral_score_history, momentum_24h, momentum_7d
  INTO v_current_score, v_history, v_momentum_24h, v_momentum_7d
  FROM public.videos 
  WHERE id = p_video_id;
  
  -- Initialize if null
  v_current_score := COALESCE(v_current_score, 0);
  v_history := COALESCE(v_history, '[]'::jsonb);
  
  -- Add current score to history
  v_history := v_history || jsonb_build_object('score', p_new_score, 'timestamp', v_now);
  
  -- Keep only last 30 entries to avoid bloat
  IF jsonb_array_length(v_history) > 30 THEN
    v_history := jsonb_build_array() || (
      SELECT jsonb_agg(elem)
      FROM (
        SELECT elem
        FROM jsonb_array_elements(v_history) elem
        ORDER BY (elem->>'timestamp')::timestamptz DESC
        LIMIT 30
      ) t
    );
  END IF;
  
  -- Calculate momentum (score increase over time periods)
  -- 24h momentum
  SELECT COALESCE(p_new_score - (elem->>'score')::numeric, 0)
  INTO v_momentum_24h
  FROM jsonb_array_elements(v_history) elem
  WHERE (elem->>'timestamp')::timestamptz >= v_now - interval '24 hours'
  ORDER BY (elem->>'timestamp')::timestamptz ASC
  LIMIT 1;
  
  -- 7d momentum
  SELECT COALESCE(p_new_score - (elem->>'score')::numeric, 0)
  INTO v_momentum_7d
  FROM jsonb_array_elements(v_history) elem
  WHERE (elem->>'timestamp')::timestamptz >= v_now - interval '7 days'
  ORDER BY (elem->>'timestamp')::timestamptz ASC
  LIMIT 1;
  
  -- Detect surge: score increased by 50%+ in last 24h or 2x+ vs previous measurement
  IF v_current_score > 0 THEN
    v_surge_factor := p_new_score / v_current_score;
    IF v_surge_factor >= 1.5 OR v_momentum_24h >= v_current_score * 0.5 THEN
      v_surge_detected := true;
    END IF;
  ELSIF p_new_score > 10 THEN -- new video with high initial score
    v_surge_detected := true;
    v_surge_factor := p_new_score / 10;
  END IF;
  
  -- Update the record
  UPDATE public.videos SET
    viral_score = p_new_score,
    viral_score_history = v_history,
    momentum_24h = v_momentum_24h,
    momentum_7d = v_momentum_7d,
    viral_momentum = GREATEST(v_momentum_24h * 0.7, v_momentum_7d * 0.3), -- weighted momentum
    surge_detected = v_surge_detected,
    surge_factor = v_surge_factor,
    last_increase_at = CASE WHEN p_new_score > v_current_score THEN v_now ELSE last_increase_at END,
    last_surge_at = CASE WHEN v_surge_detected THEN v_now ELSE last_surge_at END,
    max_viral_score = GREATEST(COALESCE(max_viral_score, 0), p_new_score),
    updated_at = v_now
  WHERE id = p_video_id;
END;
$$;

-- Usage examples:
-- SELECT public.cleanup_old_low_viral(14, 10, 7);
-- SELECT public.update_viral_metrics('video-uuid-here', 25.5);
-- To schedule: run cleanup daily and update metrics when scraping.

-- Query for UI ordering (prioritize surges, then momentum, then score):
-- SELECT * FROM public.videos 
-- WHERE NOT COALESCE(marked_for_deletion, false)
-- ORDER BY surge_detected DESC, viral_momentum DESC NULLS LAST, viral_score DESC NULLS LAST, created_at DESC
-- LIMIT 20;
