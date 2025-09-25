#!/bin/bash

# Start Douyin Video Download System
# This script starts all components of the integrated system

echo "🚀 Starting Douyin Video Download System..."
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "webapp" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing main dependencies..."
    npm install
fi

if [ ! -d "webapp/node_modules" ]; then
    echo "📦 Installing UI dependencies..."
    cd webapp && npm install && cd ..
fi

# Check environment variables
if [ ! -f ".env" ]; then
    echo "⚠️  Warning: .env file not found. Please create one with your Supabase credentials:"
    echo "   SUPABASE_URL=your_supabase_url"
    echo "   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key"
    echo ""
fi

# Start services
echo "🎬 Starting integrated system..."
echo ""
echo "Services will be available at:"
echo "  • Web UI: http://localhost:3000"
echo "  • Download API: http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Use concurrently to run all services
cd webapp
if command -v npx &> /dev/null; then
    npx concurrently \
        --names "UI,API,WORKER" \
        --prefix-colors "blue,green,yellow" \
        --kill-others \
        "npm run dev" \
        "npm run dev:api" \
        "npm run dev:worker"
else
    echo "❌ Error: npx not found. Please install Node.js and npm"
    exit 1
fi