-- Clear all data from videos table
DELETE FROM videos;

-- Also clear download jobs
DELETE FROM download_jobs;

-- Reset any sequences (if needed)
-- ALTER SEQUENCE videos_id_seq RESTART WITH 1;

-- Optional: Clear storage bucket (uncomment if needed)
-- DELETE FROM storage.objects WHERE bucket_id = 'videos';