#!/usr/bin/env node
// Simple test to manually download a Douyin video
// This bypasses the complex worker system and tests the core download logic

require('dotenv').config();
const { chromium } = require('playwright');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function getVideoFromDB() {
  console.log('🔎 Getting a video from database...');
  
  try {
    const response = await axios.get(`${SUPABASE_URL}/rest/v1/videos`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
      params: {
        select: 'id,douyin_id,title,video_url,status',
        status: 'eq.new',
        limit: 1
      }
    });
    
    return response.data[0] || null;
  } catch (error) {
    console.error('❌ Database error:', error.message);
    return null;
  }
}

async function downloadVideoWithPlaywright(videoUrl, douyinId) {
  console.log('🚀 Launching browser for:', videoUrl);
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  let directVideoUrl = null;
  
  try {
    const page = await browser.newPage({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
    });

    // Intercept video responses
    page.on('response', async (response) => {
      const url = response.url();
      const contentType = response.headers()['content-type'] || '';
      
      if (contentType.startsWith('video/') || url.includes('.mp4')) {
        console.log('🎥 Found video URL:', url.substring(0, 100) + '...');
        directVideoUrl = url;
      }
    });

    // Navigate and try to trigger video loading
    try {
      await page.goto(videoUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch (e) {
      console.log('⚠️  Page load timeout, but continuing with captured URLs...');
    }
    await page.waitForTimeout(2000);

    // Try to find and click play button or video element
    try {
      const videoElement = await page.locator('video').first();
      if (await videoElement.isVisible()) {
        await videoElement.click();
        console.log('🎬 Clicked video element');
        await page.waitForTimeout(2000);
      }
    } catch (e) {
      console.log('⚠️  Could not interact with video element');
    }

    // If we got a direct URL, download it
    if (directVideoUrl) {
      console.log('📥 Downloading video from:', directVideoUrl.substring(0, 80) + '...');
      
      const videoResponse = await axios.get(directVideoUrl, {
        responseType: 'stream',
        timeout: 60000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      // Create downloads directory
      const downloadsDir = path.join(process.cwd(), 'downloads');
      if (!fs.existsSync(downloadsDir)) {
        fs.mkdirSync(downloadsDir, { recursive: true });
      }

      // Save file
      const filename = `douyin_${douyinId}_${Date.now()}.mp4`;
      const filepath = path.join(downloadsDir, filename);
      const writer = fs.createWriteStream(filepath);

      videoResponse.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          const stats = fs.statSync(filepath);
          console.log(`✅ Downloaded: ${filename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
          resolve({ success: true, filepath, filename, size: stats.size });
        });
        writer.on('error', reject);
      });
    } else {
      return { success: false, error: 'No direct video URL found' };
    }

  } finally {
    await browser.close();
  }
}

async function main() {
  try {
    console.log('=== Simple Douyin Download Test ===');
    
    // Get a video from database
    const video = await getVideoFromDB();
    if (!video) {
      console.log('❌ No videos found in database with status "new"');
      console.log('💡 Run the crawler first: node crawler-github.js');
      process.exit(1);
    }

    console.log(`📋 Found video: ${video.title || video.douyin_id}`);
    console.log(`🔗 URL: ${video.video_url}`);

    // Try to download it
    const result = await downloadVideoWithPlaywright(video.video_url, video.douyin_id);
    
    if (result.success) {
      console.log('🎉 Download completed successfully!');
      console.log(`📁 File: ${result.filepath}`);
      console.log(`📏 Size: ${(result.size / 1024 / 1024).toFixed(2)} MB`);
    } else {
      console.log('❌ Download failed:', result.error);
      console.log('💡 This might happen if the video is geo-blocked or requires login');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();