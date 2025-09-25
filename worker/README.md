# Download Worker

Worker service để tự động download video từ Douyin và upload lên Supabase Storage.

## Tính năng

- 🔄 Tự động claim download jobs từ queue
- 🎥 Extract direct video URLs từ Douyin pages bằng Playwright
- ⬇️ Download video files với retry và validation
- ☁️ Upload lên Supabase Storage với metadata đầy đủ
- 📊 Cập nhật status trong database real-time
- 🛡️ Graceful shutdown và error handling
- 📈 Support multi-worker concurrency

## Setup

1. **Set environment variables:**
```bash
export SUPABASE_URL="your-supabase-url"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
export WORKER_ID="worker-1"          # optional, auto-generated
export MAX_CONCURRENT="2"            # optional, default 2
export POLL_INTERVAL="10000"         # optional, 10s default
export DEBUG="true"                  # optional, enable debug logs
```

2. **Tạo Supabase Storage bucket:**
   - Vào Supabase Dashboard → Storage
   - Tạo bucket tên `videos` (public read enabled)
   - Hoặc chạy SQL: `SELECT public.ensure_videos_bucket();`

3. **Run migrations:**
```sql
-- Trong Supabase SQL Editor, chạy theo thứ tự:
-- migrations/001_add_download_fields.sql
-- migrations/002_ranking_and_cleanup.sql  
-- migrations/003_worker_functions.sql
```

## Usage

### Start worker:
```bash
npm run worker
# hoặc với debug
npm run worker:dev
```

### Production deployment:
```bash
# PM2
pm2 start worker/download-worker.js --name "douyin-worker"

# Docker
docker run -e SUPABASE_URL="..." -e SUPABASE_SERVICE_ROLE_KEY="..." your-image npm run worker

# Systemd service
sudo systemctl start douyin-worker
```

## Worker Flow

```
1. Poll for pending jobs → 2. Claim job (atomic) → 3. Get video info
         ↑                                                    ↓
8. Sleep & repeat ← 7. Mark complete ← 6. Upload to storage ← 4. Extract direct URL
         ↑                     ↑                              ↓
   Handle errors ←──── 7b. Mark failed ←─────────────── 5. Download video file
```

## Job States

- `pending` → Worker chưa claim
- `running` → Worker đang xử lý  
- `completed` → Thành công
- `failed` → Lỗi (có thể retry)

## Monitoring

### Check worker stats:
```sql
SELECT * FROM public.get_worker_stats();
```

### Check active jobs:
```sql
SELECT 
  dj.id, dj.status, dj.worker_id, dj.started_at,
  v.douyin_id, v.title, v.status as video_status
FROM public.download_jobs dj
JOIN public.videos v ON dj.video_id = v.id
WHERE dj.status = 'running'
ORDER BY dj.started_at DESC;
```

### Check failed jobs:
```sql
SELECT 
  dj.id, dj.last_error, dj.attempts, 
  v.douyin_id, v.title
FROM public.download_jobs dj
JOIN public.videos v ON dj.video_id = v.id  
WHERE dj.status = 'failed'
ORDER BY dj.updated_at DESC;
```

## Retry Failed Jobs

```sql
-- Reset failed job to pending (worker sẽ tự retry)
UPDATE public.download_jobs 
SET status = 'pending', last_error = NULL, scheduled_at = now()
WHERE id = 'job-uuid-here';
```

## Logs & Debugging

Worker logs include:
- 🚀 Startup info
- 📥 Job claiming  
- 🔍 URL extraction
- ⬇️ Download progress
- ☁️ Upload status
- ✅ Success/❌ Failure

Debug mode (`DEBUG=true`) thêm:
- Network response details
- File system operations
- Detailed error traces

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SUPABASE_URL` | required | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | required | Service role key (có quyền storage) |
| `WORKER_ID` | auto | Unique worker identifier |
| `MAX_CONCURRENT` | 2 | Max concurrent downloads |
| `POLL_INTERVAL` | 10000 | Job polling interval (ms) |
| `DEBUG` | false | Enable debug logging |

### Performance Tuning

- **CPU-bound:** Tăng `MAX_CONCURRENT` cho nhiều video cùng lúc
- **Memory-bound:** Giảm `MAX_CONCURRENT`, tăng `POLL_INTERVAL`  
- **Network-bound:** Tăng timeouts trong code
- **Storage-bound:** Optimize bucket regions và CDN

## Error Handling

### Common Errors & Solutions

**"Video not found"**
- Video đã bị xóa khỏi Douyin
- → Auto-mark failed, không retry

**"Could not extract direct video URL"** 
- Anti-bot blocking hoặc page structure thay đổi
- → Retry với exponential backoff

**"Storage upload failed"**
- Network issues hoặc quota exceeded
- → Retry với temp file cleanup

**"Download timeout"**
- Large file hoặc slow connection
- → Tăng timeout hoặc implement resumable downloads

### Graceful Shutdown

Worker handles `SIGINT`/`SIGTERM`:
1. Stop accepting new jobs
2. Wait for active downloads to complete  
3. Clean up temp files
4. Reset running jobs to pending

## Scaling

### Horizontal Scaling
- Chạy nhiều worker instances với `WORKER_ID` khác nhau
- Database sử dụng `FOR UPDATE SKIP LOCKED` để tránh conflicts
- Load balancing tự động qua job queue

### Vertical Scaling  
- Tăng `MAX_CONCURRENT` per worker
- Monitor CPU/memory usage
- Optimize temp file storage (SSD recommended)

## Security Notes

- Service role key có full database access → chỉ deploy trên môi trường an toàn
- Temp files chứa video content → ensure sufficient disk space và cleanup
- Network requests đến Douyin → consider IP whitelisting/proxy nếu cần
- Storage bucket nên có proper CORS và access policies

## Integration với UI

Worker tự động cập nhật `public.videos` status:
- UI có thể poll video status để hiển thị progress
- API endpoint `/api/videos/:id/download` sẽ return signed URL khi ready
- WebSocket optional cho real-time updates

## Troubleshooting

### Worker không claim jobs
```sql
-- Check pending jobs
SELECT COUNT(*) FROM public.download_jobs WHERE status = 'pending';

-- Check worker function
SELECT public.claim_download_job('test-worker');
```

### Storage upload fails
```sql
-- Check bucket exists và policies
SELECT * FROM storage.buckets WHERE name = 'videos';
SELECT * FROM storage.policies WHERE bucket_id = 'videos';
```

### High memory usage
- Monitor temp file cleanup
- Check `MAX_CONCURRENT` setting
- Consider streaming downloads for large files

### Network timeouts
- Check Douyin accessibility from worker environment
- Consider proxy/VPN if geo-blocked
- Increase axios timeout settings