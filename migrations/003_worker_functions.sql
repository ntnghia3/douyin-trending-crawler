-- Additional SQL functions for worker support
-- Add this to your Supabase SQL editor after running migrations 001 and 002

-- Function to atomically claim a download job
CREATE OR REPLACE FUNCTION public.claim_download_job(p_worker_id text)
RETURNS TABLE(
  id uuid,
  video_id uuid,
  status text,
  scheduled_at timestamptz,
  attempts integer,
  payload jsonb
)
LANGUAGE plpgsql
AS $$
BEGIN
  -- Claim one pending job using FOR UPDATE SKIP LOCKED
  RETURN QUERY
  WITH claimed AS (
    SELECT dj.id
    FROM public.download_jobs dj
    WHERE dj.status = 'pending' 
      AND (dj.scheduled_at IS NULL OR dj.scheduled_at <= now())
    ORDER BY dj.scheduled_at NULLS FIRST, dj.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.download_jobs dj
  SET 
    status = 'running',
    worker_id = p_worker_id,
    started_at = now(),
    attempts = COALESCE(dj.attempts, 0) + 1,
    updated_at = now()
  FROM claimed c
  WHERE dj.id = c.id
  RETURNING dj.id, dj.video_id, dj.status, dj.scheduled_at, dj.attempts, dj.payload;
END;
$$;

-- Function to create Supabase Storage bucket if not exists
CREATE OR REPLACE FUNCTION public.ensure_videos_bucket()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  policy_exists boolean;
BEGIN
  -- This function should be called once to create the videos bucket
  -- Note: Actual bucket creation requires superuser or RLS bypass
  -- You may need to create the bucket manually in Supabase dashboard
  
  -- Create storage policy for videos bucket (public read, authenticated write)
  
  -- Check and create public read policy
  SELECT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND policyname = 'Allow public read videos'
  ) INTO policy_exists;
  
  IF NOT policy_exists THEN
    BEGIN
      EXECUTE 'CREATE POLICY "Allow public read videos" ON storage.objects FOR SELECT USING (bucket_id = ''videos'')';
    EXCEPTION WHEN others THEN
      -- Policy creation failed, possibly insufficient permissions
      RAISE NOTICE 'Could not create public read policy: %', SQLERRM;
    END;
  END IF;
  
  -- Check and create service role upload policy  
  SELECT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND policyname = 'Allow service role upload videos'
  ) INTO policy_exists;
  
  IF NOT policy_exists THEN
    BEGIN
      EXECUTE 'CREATE POLICY "Allow service role upload videos" ON storage.objects FOR ALL USING (bucket_id = ''videos'')';
    EXCEPTION WHEN others THEN
      -- Policy creation failed, possibly insufficient permissions
      RAISE NOTICE 'Could not create upload policy: %', SQLERRM;
    END;
  END IF;
  
END;
$$;

-- Call the function to set up storage policies
SELECT public.ensure_videos_bucket();

-- Index for efficient job claiming
CREATE INDEX IF NOT EXISTS idx_download_jobs_claim ON public.download_jobs (status, scheduled_at NULLS FIRST, created_at) WHERE status = 'pending';

-- Function to get worker statistics
CREATE OR REPLACE FUNCTION public.get_worker_stats()
RETURNS TABLE(
  total_jobs bigint,
  pending_jobs bigint,
  running_jobs bigint,
  completed_jobs bigint,
  failed_jobs bigint,
  active_workers bigint
)
LANGUAGE sql
AS $$
  SELECT 
    COUNT(*) as total_jobs,
    COUNT(*) FILTER (WHERE status = 'pending') as pending_jobs,
    COUNT(*) FILTER (WHERE status = 'running') as running_jobs,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_jobs,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_jobs,
    COUNT(DISTINCT worker_id) FILTER (WHERE status = 'running') as active_workers
  FROM public.download_jobs;
$$;