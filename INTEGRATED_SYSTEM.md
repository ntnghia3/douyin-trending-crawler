# Douyin Viral Video System - Complete Integration Guide

## 🎯 System Overview

This system consists of three main components that work together to scrape, download, and display viral Douyin videos:

1. **Crawler** - Scrapes video metadata and viral metrics
2. **Download API & Worker** - Downloads videos and stores them
3. **Web UI** - Displays videos with download functionality

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Web UI        │    │   Download API   │    │  Download       │
│   (Next.js)     │◄──►│   (Express)      │◄──►│  Worker         │
│   Port 3000     │    │   Port 3001      │    │  (Background)   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Supabase Database                            │
│  • videos table (metadata + download status)                   │
│  • download_jobs (job coordination)                            │
│  • Storage buckets (video files)                              │
└─────────────────────────────────────────────────────────────────┘
         ▲
         │
┌─────────────────┐
│   Crawler       │
│   (GitHub       │
│   Actions)      │
└─────────────────┘
```

## 🚀 Quick Start

### 1. Database Setup
First, run the migrations to set up your database:

```bash
# Apply migrations in order
psql -h your-supabase-host -U postgres -d postgres -f migrations/001_add_download_fields.sql
psql -h your-supabase-host -U postgres -d postgres -f migrations/002_ranking_and_cleanup.sql
psql -h your-supabase-host -U postgres -d postgres -f migrations/003_worker_functions.sql
```

### 2. Environment Setup
Create a `.env` file with your Supabase credentials:

```bash
# .env
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 3. Install Dependencies

```bash
# Main project dependencies
npm install

# UI dependencies
cd webapp
npm install
cd ..
```

### 4. Start All Services

```bash
# Option A: Start everything with one command
cd webapp
npm run dev:all

# Option B: Start services individually (in separate terminals)
# Terminal 1: Download API
node api/download.js

# Terminal 2: Download Worker
node worker/download-worker.js

# Terminal 3: Web UI
cd webapp
npm run dev
```

## 📱 Web UI Features

### Access the UI
- Web UI: http://localhost:3000
- Download API: http://localhost:3001

### Features
- **Video Grid**: Display all scraped videos with thumbnails
- **Viral Stats**: Show views, likes, shares for each video
- **Smart Download**: 
  - Click download button to queue video for download
  - Real-time progress tracking
  - Auto-download when ready
  - Progress states: Queued → Downloading → Ready → Downloaded

### Download Process
1. User clicks "Download" button
2. UI calls API to queue download job
3. Worker picks up job and extracts real video URL
4. Worker downloads and uploads to Supabase Storage
5. UI polls for completion and auto-downloads file

## 🔄 Crawler Integration

### Topic Configuration
Edit `config/topic.txt` to specify topics to scrape:

```
美食
旅游
舞蹈
音乐
搞笑
```

### Run Scraper
```bash
# Manual run
node crawler-github.js

# GitHub Actions (automatic)
# Configured in .github/workflows/scrape.yml
```

## 🔧 API Endpoints

### Download API (Port 3001)

#### POST /api/videos/:id/download
Queue a video for download
- Returns: `{status: 'queued|downloading|ready', downloadUrl?, filename?}`

#### GET /api/videos/:id/download  
Check download status
- Returns: `{status: 'pending|downloading|ready|error', downloadUrl?, filename?, error?}`

## 🗃️ Database Schema

### Core Tables

#### videos
```sql
- id (text, primary key)
- douyin_id (text)
- title (text)
- video_url (text)
- thumbnail_url (text)
- stats (jsonb) -- {views, likes, shares}
- viral_score (numeric) -- calculated score
- viral_momentum (numeric) -- trending momentum
- surge_detected (boolean) -- viral surge flag
- download_status (text) -- pending, downloading, ready, error
- storage_provider (text) -- supabase
- bucket (text) -- storage bucket name
- object_key (text) -- file path in storage
- filesize (bigint) -- file size in bytes
```

#### download_jobs
```sql
- id (uuid, primary key)
- video_id (text, references videos)
- status (text) -- pending, processing, completed, failed
- attempts (integer) -- retry count
- claimed_at (timestamp) -- when worker claimed job
- completed_at (timestamp) -- when job finished
- error_message (text) -- error details if failed
```

### Key Functions

#### claim_download_job()
Atomically claims a pending download job for processing
- Returns: job details or null if none available
- Uses FOR UPDATE SKIP LOCKED for concurrency

#### update_viral_metrics()
Updates viral scores and detects surges
- Called by crawler after each scrape
- Calculates momentum based on score changes
- Flags videos with sudden viral surges

#### cleanup_old_low_viral()
Removes old videos with low viral scores
- Configurable retention period
- Preserves high-performing content
- Includes storage cleanup

## 🎛️ Configuration

### Worker Settings
Edit `worker/download-worker.js`:
```javascript
const POLLING_INTERVAL = 5000; // 5 seconds
const MAX_RETRIES = 3;
const BATCH_SIZE = 1; // Process one job at a time
```

### API Settings
Edit `api/download.js`:
```javascript
const PORT = 3001;
const SIGNED_URL_EXPIRY = 3600; // 1 hour
const ENABLE_PROXY = true; // Allow direct file serving
```

### Viral Ranking
Edit viral score calculations in `migrations/002_ranking_and_cleanup.sql`:
```sql
-- Viral score formula: weighted combination of metrics
viral_score = (views * 0.4) + (likes * 0.4) + (shares * 0.2)

-- Surge detection: 50% increase in 24 hours
surge_detected = (viral_momentum > viral_score * 0.5)
```

## 🔍 Monitoring & Debugging

### Check System Status
```bash
# Database status
psql -c "SELECT status, COUNT(*) FROM videos GROUP BY download_status;"
psql -c "SELECT * FROM get_worker_stats();"

# API health
curl http://localhost:3001/health

# Worker logs
tail -f worker.log
```

### Common Issues

#### Download Stuck in "Downloading"
```sql
-- Reset stuck jobs
UPDATE download_jobs 
SET status = 'pending', claimed_at = NULL 
WHERE status = 'processing' AND claimed_at < NOW() - INTERVAL '30 minutes';
```

#### Storage Permission Issues
```sql
-- Check bucket policies
SELECT * FROM storage.buckets WHERE name = 'videos';
SELECT * FROM storage.objects WHERE bucket_id = 'videos' LIMIT 10;
```

#### UI Not Connecting to API
- Check API is running on port 3001
- Verify CORS settings in `api/download.js`
- Check browser console for errors

## 🔐 Security Considerations

### Row Level Security (RLS)
Enable RLS on videos table:
```sql
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON videos
  FOR SELECT USING (true);
```

### Storage Bucket Policies
Configure Supabase Storage policies for the `videos` bucket:
- Public read access for downloaded files
- Service role write access for worker uploads

### Rate Limiting
Implement rate limiting in production:
- API endpoint rate limits
- Download queue size limits
- Worker concurrency limits

## 📈 Performance Optimization

### Database Indexes
```sql
-- Key indexes for performance
CREATE INDEX idx_videos_viral_score ON videos(viral_score DESC);
CREATE INDEX idx_videos_download_status ON videos(download_status);
CREATE INDEX idx_download_jobs_status ON download_jobs(status, created_at);
```

### Caching
- Use Redis for download status caching
- Implement CDN for video file delivery
- Cache viral score calculations

### Scaling
- Run multiple worker instances
- Use connection pooling for database
- Implement horizontal scaling for API

## 🧪 Testing

### Manual Testing
```bash
# Test crawler
node crawler-github.js

# Test download API
curl -X POST http://localhost:3001/api/videos/VIDEO_ID/download

# Test worker
node worker/download-worker.js

# Test UI
# Visit http://localhost:3000 and click download buttons
```

### Automated Testing
```bash
# Run migration tests
npm test migrations

# Run API tests
npm test api

# Run worker tests
npm test worker
```

## 🎯 Next Steps

### Recommended Enhancements
1. **Analytics Dashboard** - Track download metrics and viral trends
2. **User Authentication** - Add user accounts and download history
3. **Batch Downloads** - Allow downloading multiple videos at once
4. **Quality Selection** - Choose video quality/format for downloads
5. **Search & Filters** - Search by title, viral score, date range
6. **Mobile App** - React Native app for mobile downloads

### Production Deployment
1. **Docker Containers** - Containerize all services
2. **Load Balancing** - Use nginx for load balancing
3. **Monitoring** - Add Prometheus/Grafana monitoring
4. **Backup Strategy** - Database and storage backups
5. **CDN Integration** - CloudFlare or AWS CloudFront
6. **Error Tracking** - Sentry integration for error monitoring

## 🤝 Support

For issues or questions:
1. Check the logs in each component
2. Verify database migrations are applied
3. Ensure all environment variables are set
4. Check network connectivity between services

The system is designed to be resilient with automatic retries and graceful error handling throughout the pipeline.