# 🚀 Optimized Douyin Trending System

Hệ thống tối ưu hóa để crawl và download video Douyin trending với khả năng tránh duplicate và download thông minh.

## 🎯 Tính Năng Chính

### ✨ Tối Ưu Hóa
- **Không Duplicate Data**: Tránh crawl và lưu trữ video đã tồn tại
- **Smart Download**: Chỉ download video chưa được download 
- **Batch Processing**: Xử lý hàng loạt hiệu quả
- **Viral Score Calculation**: Tính điểm viral và momentum thông minh
- **Error Recovery**: Tự động retry và xử lý lỗi

### 🔥 Download Thông Minh
- Download 10 video viral cao nhất trong 3 ngày gần nhất
- Ưu tiên video có surge (đột biến viral)
- Tự động bỏ qua video đã download
- Cập nhật trạng thái database real-time

## 🛠️ Cách Sử dụng

### Quick Start
```bash
# Chạy pipeline hoàn chỉnh (crawl + download)
npm run pipeline

# Chỉ download top videos (không crawl)
npm run pipeline:download

# Chỉ crawl data mới (không download)  
npm run pipeline:crawl

# Pipeline nhanh (ít video hơn)
npm run pipeline:fast
```

### Advanced Usage

#### 1. Smart Download (Tải Video Thông Minh)
```bash
# Download 10 video top viral trong 3 ngày
npm run download:smart

# Custom options
node scripts/smart-download.js --count=20 --days=7 --min-viral=100

# Download từ tuần trước
node scripts/smart-download.js --days=7 --count=15
```

**Tham số:**
- `--count=N`: Số video cần download (mặc định: 10)
- `--days=N`: Xem lại N ngày gần nhất (mặc định: 3) 
- `--min-viral=N`: Điểm viral tối thiểu (mặc định: 0)

#### 2. Efficient Crawling (Thu Thập Dữ Liệu Hiệu Quả)
```bash
# Crawl 200 video mới
npm run crawl:efficient -- --limit=200

# Crawl theo chủ đề
node scripts/efficient-crawler.js --topic=dance --limit=100

# Crawl nhiều trang
node scripts/efficient-crawler.js --limit=500 --pages=10
```

**Tham số:**
- `--limit=N`: Số video tối đa (mặc định: 100)
- `--pages=N`: Số trang scroll (mặc định: 5)
- `--topic=TEXT`: Chủ đề tìm kiếm

#### 3. Complete Pipeline (Quy Trình Hoàn Chỉnh)
```bash
# Pipeline với cấu hình custom
node scripts/complete-pipeline.js --crawl-limit=300 --download-count=15 --days=5

# Chỉ crawl
node scripts/complete-pipeline.js --crawl-only --limit=500

# Chỉ download với điều kiện khắt khe
node scripts/complete-pipeline.js --download-only --min-viral=200 --count=5

# Verbose mode để debug
node scripts/complete-pipeline.js --verbose
```

## 📊 Smart Selection Algorithm

### Viral Score Calculation
```javascript
viralScore = (playCount * 0.3) + (likeCount * 2.0) + (commentCount * 3.0) + (shareCount * 5.0)
```

### Priority Ranking
1. **Surge Detected** 🔥 - Video đang có momentum tăng đột biến
2. **Viral Momentum** 📈 - Tỷ lệ engagement cao  
3. **Viral Score** ⭐ - Điểm tổng hợp

### Time Window
- **3 ngày gần nhất**: Capture xu hướng mới nhất
- **Có thể tùy chỉnh**: 1-30 ngày tùy nhu cầu

## 📁 Cấu Trúc File

```
scripts/
├── smart-download.js      # Download thông minh top videos
├── efficient-crawler.js   # Crawl dữ liệu tối ưu
├── complete-pipeline.js   # Quy trình hoàn chỉnh
├── list-viral.js         # Xem danh sách video viral (cũ)
└── test-simple-download.js # Test download (cũ)

downloads/                # Thư mục chứa video đã tải
pipeline-status.json      # Trạng thái pipeline gần nhất
```

## 🔧 Configuration

### Environment Variables (.env)
```bash
# Database
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_api_key

# Crawling limits (optional)
CRAWL_LIMIT=200
CRAWL_PAGES=8
CRAWL_TOPIC=""

# Download limits (optional)  
DOWNLOAD_COUNT=10
DOWNLOAD_DAYS=3
MIN_VIRAL_SCORE=50
```

### CLI Override
Tất cả cấu hình có thể override bằng command line:
```bash
node scripts/complete-pipeline.js \
  --crawl-limit=500 \
  --download-count=20 \
  --topic="funny videos" \
  --days=7 \
  --min-viral=100
```

## 📈 Performance Optimizations

### Database Efficiency
- **Batch Upserts**: Xử lý nhiều record cùng lúc
- **Conflict Resolution**: Tự động merge data trùng lặp
- **Selective Queries**: Chỉ query field cần thiết
- **Connection Pooling**: Tái sử dụng kết nối

### Browser Automation
- **Headless Mode**: Không GUI, tốc độ cao
- **Network Interception**: Bắt direct video URL
- **Smart Scrolling**: Tự động load thêm content
- **Error Handling**: Retry logic thông minh

### Download Management
- **Stream Processing**: Download file lớn không tốn RAM
- **Duplicate Detection**: Kiểm tra file đã tồn tại
- **Status Tracking**: Theo dõi tiến độ real-time  
- **Parallel Processing**: Download nhiều file cùng lúc

## 🚨 Error Handling

### Automatic Recovery
- **Network Errors**: Auto retry với exponential backoff
- **Browser Crashes**: Tự khởi động lại browser
- **Database Timeouts**: Retry với connection pooling
- **File System Errors**: Cleanup và retry

### Status Tracking
```bash
# Xem trạng thái pipeline gần nhất
cat pipeline-status.json

# Xem log chi tiết
npm run pipeline -- --verbose
```

## 📝 Examples

### Use Case 1: Daily Viral Collection
```bash
# Chạy hàng ngày để lấy video viral mới
npm run pipeline -- --crawl-limit=300 --download-count=10 --days=1
```

### Use Case 2: Topic Research
```bash  
# Research chủ đề specific
npm run pipeline -- --topic="dance challenge" --crawl-limit=200 --download-count=15
```

### Use Case 3: Backfill Historical Data
```bash
# Lấy data viral từ tuần trước
npm run pipeline:download -- --days=7 --min-viral=200 --count=50
```

### Use Case 4: Quick Testing
```bash
# Test nhanh với ít data
npm run pipeline:fast
```

## 🎯 Best Practices

1. **Chạy định kỳ**: Setup cron job để chạy daily/hourly
2. **Monitor viral scores**: Theo dõi threshold phù hợp
3. **Storage management**: Cleanup file cũ định kỳ  
4. **Rate limiting**: Tránh crawl quá nhanh bị block
5. **Backup database**: Backup định kỳ để tránh mất data

## 🔄 Migration từ hệ thống cũ

```bash
# Backup data cũ
cp -r downloads downloads_backup

# Chạy hệ thống mới
npm run pipeline

# So sánh kết quả
npm run list:viral -- --format=table --limit=20
```

Hệ thống mới sẽ tự động detect và skip các video đã download từ hệ thống cũ.