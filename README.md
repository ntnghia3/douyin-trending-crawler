# Douyin Trending Video Crawler & Download System

A comprehensive system for scraping, ranking, and downloading viral Douyin videos with a modern web interface.

## 🎯 Features

### Core Functionality
- **Automated Scraping**: GitHub Actions workflow for continuous video discovery
- **Topic-Based Crawling**: Configurable topics through `config/topic.txt`
- **Viral Ranking**: Advanced scoring with momentum tracking and surge detection
- **Smart Downloads**: Background worker system for video extraction and storage
- **Modern Web UI**: Next.js interface with real-time download progress

### Advanced Features
- **Viral Momentum Tracking**: Detect videos with sudden popularity surges
- **Automatic Cleanup**: Remove old content with low viral scores
- **Download Queue**: Background processing with retry mechanisms
- **Storage Integration**: Supabase Storage with signed URLs
- **Progress Tracking**: Real-time download status updates

## 🏗️ System Architecture

```
Web UI (Next.js) ←→ Download API (Express) ←→ Worker (Background)
       ↓                    ↓                        ↓
                    Supabase Database & Storage
                              ↑
                        Crawler (GitHub Actions)
```

## 🚀 Quick Start

### 1. Clone and Setup
```bash
git clone <repo-url>
cd douyin-trending-crawler
npm install
cd webapp && npm install && cd ..
```

### 2. Database Setup
```bash
# Apply migrations in order
psql -h your-supabase-host -f migrations/001_add_download_fields.sql
psql -h your-supabase-host -f migrations/002_ranking_and_cleanup.sql
psql -h your-supabase-host -f migrations/003_worker_functions.sql
```

### 3. Environment Configuration
```bash
# Create .env file
echo "SUPABASE_URL=your_url" > .env
echo "SUPABASE_SERVICE_ROLE_KEY=your_key" >> .env
```

### 4. Start All Services
```bash
cd webapp
npm run dev:all
```

### 5. Access the System
- **Web UI**: http://localhost:3000
- **Download API**: http://localhost:3001

## 📱 Web Interface

The modern web interface provides:
- **Video Grid**: Thumbnails with viral stats (views, likes, shares)
- **Smart Downloads**: One-click downloading with progress tracking
- **Real-time Updates**: Progress states from queued → downloading → ready
- **Responsive Design**: Works on desktop and mobile devices

### Download Process
1. Click "Download" button on any video
2. System queues the download job
3. Background worker extracts real video URL
4. Worker downloads and stores video
5. UI automatically starts file download when ready

## 🔧 Configuration

### Topics
Edit `config/topic.txt` to customize scraping topics:
```
美食
旅游
舞蹈
音乐
搞笑
```

### Viral Ranking
The system calculates viral scores using:
- **Views** (40% weight)
- **Likes** (40% weight) 
- **Shares** (20% weight)

Videos with 50%+ score increases in 24 hours are flagged as "surge detected".

## 🗄️ Database Schema

### Core Tables
- **videos**: Video metadata, viral scores, download status
- **download_jobs**: Job queue for background processing
- **Storage**: Supabase Storage for video files

### Key Functions
- `claim_download_job()`: Atomic job claiming
- `update_viral_metrics()`: Score calculation and surge detection
- `cleanup_old_low_viral()`: Automated content cleanup

## 🔄 Crawler

### GitHub Actions Workflow
Automated scraping runs on schedule:
- Visits topic/trending pages
- Extracts video metadata and stats
- Captures direct video URLs when possible
- Updates viral metrics and momentum

### Manual Run
```bash
node crawler-github.js
```

## 🎛️ API Endpoints

### Download API (Port 3001)
- `POST /api/videos/:id/download` - Queue download
- `GET /api/videos/:id/download` - Check status

### Response Format
```json
{
  "status": "queued|downloading|ready|error",
  "downloadUrl": "signed_url_when_ready",
  "filename": "suggested_filename.mp4",
  "error": "error_message_if_failed"
}
```

## 🔍 Monitoring

### System Status
```bash
# Check database status
psql -c "SELECT download_status, COUNT(*) FROM videos GROUP BY download_status;"

# Worker statistics
psql -c "SELECT * FROM get_worker_stats();"

# API health
curl http://localhost:3001/health
```

### Logs
- Worker: Console output with job processing details
- API: Express server logs with request/response info
- UI: Browser console for client-side debugging

## 🛠️ Development

### Project Structure
```
├── migrations/           # Database schema migrations
├── api/                 # Express.js download API
├── worker/              # Background download worker
├── webapp/              # Next.js web interface
├── config/              # Configuration files
├── crawler-github.js    # Main crawler script
└── .github/workflows/   # GitHub Actions
```

### Running Components Separately
```bash
# Download API
node api/download.js

# Background Worker  
node worker/download-worker.js

# Web UI
cd webapp && npm run dev

# Crawler
node crawler-github.js
```

## 🚀 Production Deployment

### Docker (Recommended)
```bash
# Build containers
docker-compose build

# Start services
docker-compose up -d
```

### Manual Deployment
1. Deploy API server (Express.js)
2. Deploy background worker (Node.js process)
3. Deploy web UI (Next.js static/SSR)
4. Configure Supabase database and storage
5. Set up GitHub Actions for automated crawling

## 📈 Performance & Scaling

### Optimization Tips
- Use connection pooling for database
- Implement Redis caching for download status
- Add CDN for video file delivery
- Run multiple worker instances for high throughput

### Monitoring & Alerts
- Database performance metrics
- Download success/failure rates
- Storage usage and costs
- API response times

## 🔐 Security

### Database Security
- Row Level Security (RLS) enabled
- Service role for backend operations
- Anonymous role for public read access

### Storage Security
- Signed URLs for temporary access
- Public read policy for downloaded files
- Service role write access for uploads

## 📚 Documentation

- **[Complete Integration Guide](INTEGRATED_SYSTEM.md)**: Detailed setup and configuration
- **[API Documentation](api/README.md)**: Download API endpoints and usage
- **[Worker Documentation](worker/README.md)**: Background processing details
- **[Migration Guide](migrations/README.md)**: Database schema and migrations

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📝 License

This project is for educational purposes. Please respect Douyin's terms of service and robots.txt when using this crawler.