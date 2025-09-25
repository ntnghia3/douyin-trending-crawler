#!/bin/bash

echo "🎬 Starting Douyin Video System..."
echo ""

# Kiểm tra .env file
if [ ! -f ".env" ]; then
    echo "⚠️ Cần tạo file .env với thông tin Supabase:"
    echo "cp .env.example .env"
    echo "Sau đó edit file .env với thông tin thật của bạn"
    echo ""
fi

echo "📍 Services sẽ chạy tại:"
echo "  • Web UI: http://localhost:3000"
echo "  • Download API: http://localhost:3001"
echo ""
echo "🎯 Để test download:"
echo "  1. Mở http://localhost:3000"
echo "  2. Click 'Add Test Video' để tạo video test"
echo "  3. Click nút 'Download' trên video bất kỳ"
echo "  4. File sẽ tự động download về thư mục Downloads"
echo ""
echo "Press Ctrl+C to stop..."
echo ""

# Start all services
cd webapp
npm run dev:all