-- Migration: add download support fields to public.videos and create download_jobs table
-- Run in Supabase SQL editor or psql connected to your database

BEGIN;

-- 1) Add columns if they do not exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'videos' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.videos
      ADD COLUMN status text NOT NULL DEFAULT 'new',
      ADD COLUMN attempts integer NOT NULL DEFAULT 0,
      ADD COLUMN last_attempt_at timestamptz NULL,
      ADD COLUMN last_error text NULL,
      ADD COLUMN download_started_at timestamptz NULL,
      ADD COLUMN downloaded_at timestamptz NULL,
      ADD COLUMN storage_provider text NULL,
      ADD COLUMN bucket text NULL,
      ADD COLUMN object_key text NULL,
      ADD COLUMN storage_etag text NULL,
      ADD COLUMN storage_metadata jsonb NULL,
      ADD COLUMN public_url_expires_at timestamptz NULL,
      ADD COLUMN public_url_meta jsonb NULL,
      ADD COLUMN filesize bigint NULL,
      ADD COLUMN mime_type text NULL,
      ADD COLUMN created_by uuid NULL,
      ADD COLUMN updated_at timestamptz NULL DEFAULT now(),
      ADD COLUMN updated_by uuid NULL,
      ADD COLUMN in_progress_by text NULL,
      ADD COLUMN in_progress_at timestamptz NULL;
  END IF;
END
$$;

-- 2) Create download_jobs table
CREATE TABLE IF NOT EXISTS public.download_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  worker_id text NULL,
  scheduled_at timestamptz NULL,
  started_at timestamptz NULL,
  finished_at timestamptz NULL,
  attempts integer NOT NULL DEFAULT 0,
  last_error text NULL,
  payload jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT download_jobs_pkey PRIMARY KEY (id)
);

-- 3) Indexes
CREATE INDEX IF NOT EXISTS idx_videos_status_created_at ON public.videos (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_downloaded_at ON public.videos (downloaded_at);
CREATE INDEX IF NOT EXISTS idx_videos_in_progress_by ON public.videos (in_progress_by);
CREATE INDEX IF NOT EXISTS idx_download_jobs_status_scheduled_at ON public.download_jobs (status, scheduled_at);

COMMIT;
