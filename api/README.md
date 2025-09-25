# Download API

API endpoint để download video từ Douyin trending database.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set environment variables:
```bash
export SUPABASE_URL="your-supabase-url"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
export PORT=3001  # optional, defaults to 3001
```

3. Start API server:
```bash
npm run api
# or
node api/download.js
```

## Endpoints

### GET /api/videos/:id/download

Download hoặc lấy thông tin download của video.

**Parameters:**
- `id` (path) - UUID của video trong database
- `proxy` (query, optional) - nếu `true`, proxy file qua server; nếu `false` hoặc không có, trả signed URL

**Responses:**

**202 Accepted** - Video đang được queue hoặc download:
```json
{
  "status": "queued",
  "message": "Download has been queued", 
  "estimated_wait": "2-5 minutes"
}
```

**200 OK** - Video sẵn sàng download:
```json
{
  "status": "ready",
  "download_url": "https://storage.url/signed-url",
  "expires_at": "2024-03-15T12:00:00Z",
  "filename": "video_title_douyinid.mp4",
  "filesize": 12345678,
  "mime_type": "video/mp4"
}
```

**500 Internal Server Error** - Download thất bại:
```json
{
  "status": "failed",
  "error": "Network timeout",
  "retry_available": true
}
```

### POST /api/videos/:id/retry

Retry download video bị failed.

**Response:**
```json
{
  "status": "queued",
  "message": "Retry scheduled successfully"
}
```

### GET /health

Health check endpoint.

## Usage Examples

### Download với signed URL (khuyến nghị):
```bash
curl "http://localhost:3001/api/videos/123e4567-e89b-12d3-a456-426614174000/download"
```

### Download với proxy qua server:
```bash
curl "http://localhost:3001/api/videos/123e4567-e89b-12d3-a456-426614174000/download?proxy=true" -o video.mp4
```

### Retry failed download:
```bash
curl -X POST "http://localhost:3001/api/videos/123e4567-e89b-12d3-a456-426614174000/retry"
```

## Integration với UI

Từ frontend (React/Vue/etc):

```javascript
// Check download status
const response = await fetch(`/api/videos/${videoId}/download`);
const result = await response.json();

if (response.status === 202) {
  // Show "Queued" or "Downloading" status
  console.log(result.message);
  // Poll lại sau 30s
} else if (response.status === 200) {
  // Ready to download
  window.open(result.download_url, '_blank');
} else {
  // Error
  console.error(result.error);
}
```

## Status Flow

```
new/queued → downloading → uploaded/processed → ready
     ↓            ↓              ↓
   failed ←─── failed ←───── failed
     ↓
   retry → queued
```

## Security Notes

- API sử dụng Supabase service role key - chỉ deploy trên server tin cậy
- Signed URLs có expiry 1 giờ  
- Proxy mode cho phép thêm access control và audit logs
- Validate UUID format để tránh injection
- Rate limiting nên được thêm cho production

## Deployment

### Vercel/Netlify Functions:
- Deploy `api/download.js` như serverless function
- Set environment variables trong dashboard

### Docker:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["npm", "run", "api"]
```

### PM2:
```bash
pm2 start api/download.js --name "download-api"
```