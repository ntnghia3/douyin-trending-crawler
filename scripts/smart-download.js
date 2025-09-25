#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { chromium } = require('playwright');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Command line arguments
const args = {
  count: parseInt(process.argv.find(arg => arg.startsWith('--count='))?.split('=')[1]) || 10,
  days: parseInt(process.argv.find(arg => arg.startsWith('--days='))?.split('=')[1]) || 3,
  minViralScore: parseInt(process.argv.find(arg => arg.startsWith('--min-viral='))?.split('=')[1]) || 0,
  mock: process.argv.includes('--mock') || process.argv.includes('--demo'),
  help: process.argv.includes('--help') || process.argv.includes('-h')
};

if (args.help) {
  console.log(`
🚀 Smart Douyin Video Downloader

Usage: node scripts/smart-download.js [options]

Options:
  --count=N        Number of videos to download (default: 10)
  --days=N         Look back N days for trending videos (default: 3)
  --min-viral=N    Minimum viral score threshold (default: 0)
  --mock           Demo mode - simulate downloads (when Douyin not accessible)
  --help, -h       Show this help message

Examples:
  node scripts/smart-download.js --count=5 --days=7
  node scripts/smart-download.js --count=20 --min-viral=100
  node scripts/smart-download.js --mock --count=3
  npm run smart:download -- --count=15
`);
  process.exit(0);
}

console.log(`🎯 Smart Download Config:
  • Videos to download: ${args.count}
  • Time window: ${args.days} days
  • Min viral score: ${args.minViralScore}
`);

// Supabase client functions
const supabase = {
  async query(table, options = {}) {
    const { select = '*', filter = '', order = '', limit = 1000 } = options;
    let url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}`;
    
    if (filter) url += `&${filter}`;
    if (order) url += `&order=${order}`;
    if (limit) url += `&limit=${limit}`;
    
    const response = await axios.get(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    return response.data;
  },

  async update(table, id, data) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`;
    
    const response = await axios.patch(url, data, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      }
    });
    
    return response.data;
  }
};

// Get top viral videos that haven't been downloaded
async function getTopViralVideos() {
  console.log('🔍 Finding top viral videos...');
  
  const daysAgo = new Date(Date.now() - args.days * 24 * 60 * 60 * 1000).toISOString();
  
  // Query for videos with high viral scores that haven't been downloaded
  const videos = await supabase.query('videos', {
    select: 'id,douyin_id,title,video_url,viral_score,viral_momentum,momentum_24h,surge_detected,surge_factor,created_at,status,downloaded_at,storage_path',
    filter: [
      `created_at=gte.${daysAgo}`,
      `viral_score=gte.${args.minViralScore}`,
      `or=(downloaded_at.is.null,status.eq.new,status.eq.failed)`, // Not downloaded or failed
      `processed=eq.false` // Not processed yet
    ].join('&'),
    order: 'viral_score.desc,viral_momentum.desc,surge_factor.desc',
    limit: args.count * 2 // Get more to account for filtering
  });
  
  console.log(`📊 Found ${videos.length} candidate videos`);
  
  // Filter out already downloaded videos (double check)
  const filteredVideos = videos.filter(video => {
    const hasFile = video.storage_path && fs.existsSync(video.storage_path);
    const isDownloaded = video.downloaded_at || video.status === 'completed';
    return !hasFile && !isDownloaded;
  }).slice(0, args.count);
  
  console.log(`✅ Selected ${filteredVideos.length} videos for download`);
  
  // Sort by priority: surge_detected > viral_momentum > viral_score
  filteredVideos.sort((a, b) => {
    if (a.surge_detected !== b.surge_detected) {
      return b.surge_detected - a.surge_detected; // Surging videos first
    }
    if (Math.abs(a.viral_momentum - b.viral_momentum) > 10) {
      return b.viral_momentum - a.viral_momentum; // Higher momentum
    }
    return b.viral_score - a.viral_score; // Higher viral score
  });
  
  return filteredVideos;
}

// Extract douyin ID from various URL formats
function extractDouyinIdFromUrl(url) {
  const patterns = [
    /\/video\/(\d+)/,
    /aweme_id[=:](\d+)/,
    /item_ids[=:](\d+)/,
    /vid[=:]v0200[a-z0-9]*[u|c](\d+)/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Download single video using browser automation
async function downloadVideo(video, browser) {
  const { id, douyin_id, video_url, title } = video;
  
  console.log(`\n🎬 Downloading: ${douyin_id}`);
  console.log(`   Title: ${title || 'No title'}`);
  console.log(`   URL: ${video_url}`);
  console.log(`   Viral Score: ${video.viral_score} | Momentum: ${video.viral_momentum}`);
  
  // Update status to downloading
  await supabase.update('videos', id, {
    status: 'downloading',
    download_started_at: new Date().toISOString(),
    in_progress_by: 'smart-download-script',
    in_progress_at: new Date().toISOString()
  });
  
  let directVideoUrl = null;
  let downloadPath = null;
  
  try {
    const page = await browser.newPage({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });
    
    // Intercept network responses to find direct video URL
    page.on('response', async (response) => {
      try {
        const responseUrl = response.url();
        const contentType = response.headers()['content-type'] || '';
        
        if (contentType.startsWith('video/') || responseUrl.includes('.mp4')) {
          const extractedId = extractDouyinIdFromUrl(responseUrl);
          if (extractedId === douyin_id || responseUrl.includes(douyin_id)) {
            directVideoUrl = responseUrl;
            console.log(`   ✅ Found video URL: ${responseUrl.substring(0, 80)}...`);
          }
        }
      } catch (err) {
        // Ignore network errors
      }
    });
    
    // Navigate to video page
    console.log(`   🔄 Loading page...`);
    await page.goto(video_url, { waitUntil: 'networkidle', timeout: 30000 });
    
    // Wait a bit for video to load
    await page.waitForTimeout(3000);
    
    // Close page
    await page.close();
    
    if (!directVideoUrl) {
      throw new Error('Could not find direct video URL');
    }
    
    // Download the video file
    console.log(`   ⬇️  Downloading video...`);
    const response = await axios.get(directVideoUrl, {
      responseType: 'stream',
      timeout: 60000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.douyin.com/'
      }
    });
    
    // Create downloads directory
    const downloadsDir = path.join(process.cwd(), 'downloads');
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir, { recursive: true });
    }
    
    // Generate filename
    const timestamp = Date.now();
    const filename = `douyin_${douyin_id}_${timestamp}.mp4`;
    downloadPath = path.join(downloadsDir, filename);
    
    // Stream to file
    const writer = fs.createWriteStream(downloadPath);
    response.data.pipe(writer);
    
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    
    // Get file size
    const stats = fs.statSync(downloadPath);
    const fileSize = stats.size;
    
    console.log(`   ✅ Downloaded: ${filename} (${(fileSize / 1024).toFixed(1)} KB)`);
    
    // Update database with success
    await supabase.update('videos', id, {
      status: 'completed',
      downloaded_at: new Date().toISOString(),
      storage_path: downloadPath,
      filesize: fileSize,
      mime_type: 'video/mp4',
      processed: true,
      in_progress_by: null,
      in_progress_at: null,
      updated_at: new Date().toISOString()
    });
    
    return { success: true, path: downloadPath, size: fileSize };
    
  } catch (error) {
    console.error(`   ❌ Error downloading ${douyin_id}:`, error.message);
    
    // Clean up partial file
    if (downloadPath && fs.existsSync(downloadPath)) {
      fs.unlinkSync(downloadPath);
    }
    
    // Update database with failure
    await supabase.update('videos', id, {
      status: 'failed',
      last_error: error.message,
      last_attempt_at: new Date().toISOString(),
      attempts: (video.attempts || 0) + 1,
      in_progress_by: null,
      in_progress_at: null,
      updated_at: new Date().toISOString()
    });
    
    return { success: false, error: error.message };
  }
}

// Mock download for demo
async function mockDownload(video) {
  const { id, douyin_id, title } = video;
  
  console.log(`\n🎭 MOCK Downloading: ${douyin_id}`);
  console.log(`   Title: ${title || 'No title'}`);
  console.log(`   Viral Score: ${video.viral_score} | Momentum: ${video.viral_momentum}`);
  
  // Simulate download time
  console.log(`   🔄 Simulating download...`);
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Simulate random success/failure
  const success = Math.random() > 0.2; // 80% success rate
  
  if (success) {
    const mockSize = Math.floor(Math.random() * 5000 + 1000) * 1024; // 1-5MB
    const filename = `douyin_${douyin_id}_${Date.now()}.mp4`;
    
    console.log(`   ✅ MOCK Downloaded: ${filename} (${(mockSize / 1024).toFixed(1)} KB)`);
    
    // Update database with mock success
    await supabase.update('videos', id, {
      status: 'completed',
      downloaded_at: new Date().toISOString(),
      storage_path: `./downloads/${filename}`,
      filesize: mockSize,
      mime_type: 'video/mp4',
      processed: true,
      updated_at: new Date().toISOString()
    });
    
    return { success: true, path: `./downloads/${filename}`, size: mockSize };
  } else {
    console.log(`   ❌ MOCK Download failed: Network timeout (simulated)`);
    
    await supabase.update('videos', id, {
      status: 'failed',
      last_error: 'Mock network timeout',
      last_attempt_at: new Date().toISOString(),
      attempts: (video.attempts || 0) + 1,
      updated_at: new Date().toISOString()
    });
    
    return { success: false, error: 'Mock network timeout' };
  }
}

// Main execution
async function main() {
  try {
    const mode = args.mock ? '🎭 MOCK/DEMO' : '🚀';
    console.log(`${mode} Starting Smart Download Process...\n`);
    
    if (args.mock) {
      console.log('⚠️  Running in MOCK mode - simulating downloads for demo');
      console.log('   No actual files will be downloaded\n');
    }
    
    // Get top viral videos
    const videos = await getTopViralVideos();
    
    if (videos.length === 0) {
      console.log('🤷 No videos found matching criteria');
      return;
    }
    
    console.log(`\n📋 Download Queue:`);
    videos.forEach((video, index) => {
      console.log(`  ${index + 1}. ${video.douyin_id} - Score: ${video.viral_score}, Momentum: ${video.viral_momentum}${video.surge_detected ? ' 🔥' : ''}`);
    });
    
    const results = {
      success: 0,
      failed: 0,
      totalSize: 0
    };
    
    if (args.mock) {
      // Mock mode - no browser needed
      console.log('\n� Running mock downloads...');
      
      for (let i = 0; i < videos.length; i++) {
        const video = videos[i];
        console.log(`\n📥 Progress: ${i + 1}/${videos.length}`);
        
        const result = await mockDownload(video);
        
        if (result.success) {
          results.success++;
          results.totalSize += result.size;
        } else {
          results.failed++;
        }
        
        // Brief pause between downloads
        if (i < videos.length - 1) {
          console.log('   ⏸️  Waiting 1 second...');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    } else {
      // Real download mode
      console.log('\n🌐 Launching browser...');
      const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage']
      });
      
      // Download each video
      for (let i = 0; i < videos.length; i++) {
        const video = videos[i];
        console.log(`\n📥 Progress: ${i + 1}/${videos.length}`);
        
        const result = await downloadVideo(video, browser);
        
        if (result.success) {
          results.success++;
          results.totalSize += result.size;
        } else {
          results.failed++;
        }
        
        // Brief pause between downloads
        if (i < videos.length - 1) {
          console.log('   ⏸️  Waiting 2 seconds...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      // Close browser
      await browser.close();
    }
    
    // Final summary
    console.log(`\n🎉 Download Complete!`);
    console.log(`✅ Successful: ${results.success}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`📦 Total size: ${(results.totalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`📁 Files saved to: ./downloads/`);
    
  } catch (error) {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main, getTopViralVideos, downloadVideo };