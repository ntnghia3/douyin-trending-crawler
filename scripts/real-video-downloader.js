#!/usr/bin/env node

/**
 * 🎯 REAL VIDEO DOWNLOADER - Focus on Actual Downloads
 * 
 * Bypass detection và download real Douyin videos
 */

const { chromium } = require('playwright');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

class RealVideoDownloader {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL || 'https://your-project.supabase.co',
      process.env.SUPABASE_ANON_KEY || 'your-anon-key'
    );
    
    this.downloadDir = path.join(__dirname, '..', 'real_downloads');
    this.proxyList = [
      // Thêm proxy servers nếu có
      'http://proxy1:port',
      'http://proxy2:port'
    ];
    
    this.userAgents = [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Android 12; Mobile; rv:91.0) Gecko/91.0 Firefox/91.0',
      'Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Mobile Safari/537.36'
    ];
  }

  /**
   * 🚀 Main download function - Real videos only
   */
  async downloadRealVideos(maxVideos = 10) {
    console.log(`🎯 Starting REAL video download (target: ${maxVideos} videos)...`);
    
    await this.ensureDownloadDir();
    
    // Try multiple approaches simultaneously
    const downloadPromises = [
      this.downloadFromDirectLinks(),
      this.downloadFromMobileAPI(),
      this.downloadFromBrowserCapture(),
      this.downloadFromProxyRotation()
    ];
    
    const results = await Promise.allSettled(downloadPromises);
    const successfulDownloads = [];
    
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value.length > 0) {
        successfulDownloads.push(...result.value);
      }
    });
    
    console.log(`✅ Successfully downloaded ${successfulDownloads.length} REAL videos`);
    
    // Save metadata to database
    if (successfulDownloads.length > 0) {
      await this.saveDownloadMetadata(successfulDownloads);
    }
    
    return successfulDownloads;
  }

  /**
   * 📱 Method 1: Download from direct video links
   */
  async downloadFromDirectLinks() {
    console.log('📱 Attempting direct link downloads...');
    
    const videoLinks = [
      // Thêm direct video URLs nếu có
      'https://v26-web.douyinvod.com/video1.mp4',
      'https://v26-web.douyinvod.com/video2.mp4'
    ];
    
    const downloads = [];
    
    for (const link of videoLinks) {
      try {
        const videoId = this.extractVideoId(link);
        const filename = `real_${videoId}_${Date.now()}.mp4`;
        const filepath = path.join(this.downloadDir, filename);
        
        console.log(`⬇️ Downloading: ${link}`);
        
        const response = await axios({
          method: 'GET',
          url: link,
          responseType: 'stream',
          timeout: 30000,
          headers: {
            'User-Agent': this.getRandomUserAgent(),
            'Referer': 'https://www.douyin.com/',
            'Accept': 'video/mp4,video/*,*/*'
          }
        });
        
        const writer = require('fs').createWriteStream(filepath);
        response.data.pipe(writer);
        
        await new Promise((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
        });
        
        const stats = await fs.stat(filepath);
        
        if (stats.size > 100000) { // Valid video file > 100KB
          console.log(`✅ Downloaded: ${filename} (${Math.round(stats.size / 1024)}KB)`);
          
          downloads.push({
            douyin_id: videoId,
            filename: filename,
            filepath: filepath,
            filesize: stats.size,
            download_method: 'direct_link',
            download_time: new Date().toISOString(),
            source_url: link
          });
        } else {
          // Delete small/invalid files
          await fs.unlink(filepath);
          console.log(`❌ Invalid video file (too small): ${filename}`);
        }
        
      } catch (error) {
        console.log(`❌ Direct download failed: ${error.message}`);
      }
    }
    
    return downloads;
  }

  /**
   * 📱 Method 2: Mobile API extraction with real download
   */
  async downloadFromMobileAPI() {
    console.log('📱 Attempting mobile API downloads...');
    
    const downloads = [];
    
    try {
      // Real mobile API endpoints (update with working ones)
      const mobileEndpoints = [
        'https://www.douyin.com/aweme/v1/feed/',
        'https://www.douyin.com/aweme/v1/hot/search/list/',
        'https://aweme.snssdk.com/aweme/v1/feed/'
      ];
      
      for (const endpoint of mobileEndpoints) {
        try {
          console.log(`🔍 Trying mobile API: ${endpoint}`);
          
          const response = await axios.get(endpoint, {
            headers: {
              'User-Agent': 'com.ss.android.ugc.aweme/160901 (Linux; U; Android 9; en_US; SM-G973F; Build/PPR1.180610.011; Cronet/TTNetVersion:b4d74d15 2020-04-23 QuicVersion:0144d358 2020-03-24)',
              'X-Requested-With': 'com.ss.android.ugc.aweme',
              'Accept-Encoding': 'gzip, deflate'
            },
            timeout: 15000
          });
          
          const data = response.data;
          
          if (data.aweme_list && Array.isArray(data.aweme_list)) {
            console.log(`📱 Found ${data.aweme_list.length} videos in mobile API`);
            
            for (const video of data.aweme_list.slice(0, 5)) {
              const downloadResult = await this.downloadVideoFromAPI(video);
              if (downloadResult) {
                downloads.push(downloadResult);
              }
            }
          }
          
        } catch (error) {
          console.log(`❌ Mobile API ${endpoint} failed: ${error.message}`);
        }
      }
      
    } catch (error) {
      console.log('❌ Mobile API method failed:', error.message);
    }
    
    return downloads;
  }

  /**
   * 🎥 Method 3: Browser capture with network interception
   */
  async downloadFromBrowserCapture() {
    console.log('🎥 Attempting browser capture downloads...');
    
    const downloads = [];
    
    try {
      const browser = await chromium.launch({
        headless: false, // Show browser for debugging
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-features=VizDisplayCompositor',
          '--disable-web-security',
          '--disable-features=TranslateUI',
          '--disable-ipc-flooding-protection'
        ]
      });
      
      const context = await browser.newContext({
        userAgent: this.getRandomUserAgent(),
        viewport: { width: 375, height: 812 }, // Mobile viewport
        locale: 'zh-CN',
        timezoneId: 'Asia/Shanghai'
      });
      
      const page = await context.newPage();
      
      // Intercept video requests
      const videoUrls = new Set();
      
      page.on('response', async (response) => {
        const url = response.url();
        const contentType = response.headers()['content-type'] || '';
        
        if (contentType.includes('video/') || url.includes('.mp4') || url.includes('/video/')) {
          console.log(`🎥 Intercepted video: ${url}`);
          videoUrls.add(url);
        }
      });
      
      // Navigate to Douyin and trigger video loading
      console.log('🌐 Loading Douyin page...');
      await page.goto('https://www.douyin.com', { waitUntil: 'networkidle' });
      
      // Wait for videos to load
      await page.waitForTimeout(5000);
      
      // Scroll to trigger more video loading
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollBy(0, 1000));
        await page.waitForTimeout(2000);
      }
      
      console.log(`🎥 Captured ${videoUrls.size} video URLs`);
      
      // Download captured videos
      for (const videoUrl of Array.from(videoUrls).slice(0, 10)) {
        try {
          const downloadResult = await this.downloadVideoFromUrl(videoUrl, 'browser_capture');
          if (downloadResult) {
            downloads.push(downloadResult);
          }
        } catch (error) {
          console.log(`❌ Failed to download ${videoUrl}: ${error.message}`);
        }
      }
      
      await browser.close();
      
    } catch (error) {
      console.log('❌ Browser capture method failed:', error.message);
    }
    
    return downloads;
  }

  /**
   * 🔄 Method 4: Proxy rotation downloads
   */
  async downloadFromProxyRotation() {
    console.log('🔄 Attempting proxy rotation downloads...');
    
    const downloads = [];
    
    // If no proxies configured, skip this method
    if (this.proxyList.length === 0 || this.proxyList[0] === 'http://proxy1:port') {
      console.log('⚠️ No proxy servers configured, skipping proxy method');
      return downloads;
    }
    
    for (const proxy of this.proxyList) {
      try {
        console.log(`🔄 Using proxy: ${proxy}`);
        
        // Use proxy for requests
        const axiosInstance = axios.create({
          proxy: {
            protocol: 'http',
            host: proxy.split(':')[1].replace('//', ''),
            port: parseInt(proxy.split(':')[2])
          },
          timeout: 15000
        });
        
        // Make requests through proxy
        const response = await axiosInstance.get('https://www.douyin.com/api/suggest_words/', {
          headers: {
            'User-Agent': this.getRandomUserAgent(),
            'Referer': 'https://www.douyin.com/'
          }
        });
        
        console.log(`✅ Proxy ${proxy} working`);
        
        // Add proxy-specific download logic here
        
      } catch (error) {
        console.log(`❌ Proxy ${proxy} failed: ${error.message}`);
      }
    }
    
    return downloads;
  }

  /**
   * ⬬ Download video from API response
   */
  async downloadVideoFromAPI(videoData) {
    try {
      const videoUrl = videoData.video?.play_url?.url_list?.[0] || 
                      videoData.video?.download_url?.url_list?.[0];
      
      if (!videoUrl) {
        console.log('❌ No download URL found in API response');
        return null;
      }
      
      const videoId = videoData.aweme_id || `api_${Date.now()}`;
      
      return await this.downloadVideoFromUrl(videoUrl, 'mobile_api', videoId, videoData);
      
    } catch (error) {
      console.log('❌ API download failed:', error.message);
      return null;
    }
  }

  /**
   * ⬬ Download video from URL
   */
  async downloadVideoFromUrl(videoUrl, method, videoId = null, metadata = {}) {
    try {
      if (!videoId) {
        videoId = this.extractVideoId(videoUrl) || `${method}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }
      
      const filename = `real_${videoId}_${Date.now()}.mp4`;
      const filepath = path.join(this.downloadDir, filename);
      
      console.log(`⬇️ Downloading real video: ${videoId}`);
      
      const response = await axios({
        method: 'GET',
        url: videoUrl,
        responseType: 'stream',
        timeout: 60000, // 1 minute timeout for large files
        headers: {
          'User-Agent': this.getRandomUserAgent(),
          'Referer': 'https://www.douyin.com/',
          'Accept': 'video/mp4,video/*,*/*'
        }
      });
      
      const writer = require('fs').createWriteStream(filepath);
      response.data.pipe(writer);
      
      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
      
      const stats = await fs.stat(filepath);
      
      if (stats.size > 500000) { // Real videos should be > 500KB
        console.log(`✅ Real video downloaded: ${filename} (${Math.round(stats.size / 1024 / 1024 * 100) / 100}MB)`);
        
        return {
          douyin_id: videoId,
          filename: filename,
          filepath: filepath,
          filesize: stats.size,
          download_method: method,
          download_time: new Date().toISOString(),
          source_url: videoUrl,
          title: metadata.desc || 'Real Douyin Video',
          author_name: metadata.author?.nickname || 'Unknown',
          play_count: metadata.statistics?.play_count || 0,
          like_count: metadata.statistics?.digg_count || 0,
          comment_count: metadata.statistics?.comment_count || 0,
          share_count: metadata.statistics?.share_count || 0
        };
      } else {
        await fs.unlink(filepath);
        console.log(`❌ Invalid video file (too small): ${filename}`);
        return null;
      }
      
    } catch (error) {
      console.log(`❌ Video download failed: ${error.message}`);
      return null;
    }
  }

  /**
   * 🗂️ Save download metadata to database
   */
  async saveDownloadMetadata(downloads) {
    if (!downloads.length) return;
    
    try {
      console.log(`💾 Saving ${downloads.length} real video records to database...`);
      
      const { error } = await this.supabase
        .from('douyin_videos')
        .upsert(downloads, {
          onConflict: 'douyin_id',
          ignoreDuplicates: false
        });
      
      if (error) throw error;
      
      console.log(`✅ Successfully saved ${downloads.length} real video records`);
      
    } catch (error) {
      console.error('❌ Database save failed:', error.message);
    }
  }

  /**
   * 🛠️ Helper functions
   */
  async ensureDownloadDir() {
    try {
      await fs.mkdir(this.downloadDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  extractVideoId(url) {
    const matches = url.match(/\/(\d+)\//) || url.match(/aweme_id=(\d+)/) || url.match(/video\/(\d+)/);
    return matches ? matches[1] : null;
  }

  getRandomUserAgent() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  /**
   * 📊 Show download summary
   */
  async showDownloadSummary() {
    try {
      const files = await fs.readdir(this.downloadDir);
      const videoFiles = files.filter(f => f.endsWith('.mp4'));
      
      console.log(`\n📊 REAL DOWNLOAD SUMMARY:`);
      console.log(`• Total video files: ${videoFiles.length}`);
      
      let totalSize = 0;
      for (const file of videoFiles) {
        const stats = await fs.stat(path.join(this.downloadDir, file));
        totalSize += stats.size;
      }
      
      console.log(`• Total size: ${Math.round(totalSize / 1024 / 1024 * 100) / 100}MB`);
      console.log(`• Average file size: ${Math.round(totalSize / videoFiles.length / 1024 * 100) / 100}KB`);
      
      // Show recent downloads
      const recentFiles = videoFiles
        .sort((a, b) => b.localeCompare(a))
        .slice(0, 5);
        
      console.log(`\n📹 Recent real downloads:`);
      recentFiles.forEach(file => {
        console.log(`   • ${file}`);
      });
      
    } catch (error) {
      console.log('📁 No downloads directory found yet');
    }
  }
}

// Main execution
async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                    🎯 REAL VIDEO DOWNLOADER                          ║
╚══════════════════════════════════════════════════════════════════════╝

Focus: Download actual Douyin videos using multiple methods
Methods: Direct links, Mobile API, Browser capture, Proxy rotation
Output: Real MP4 files ready to play

🚀 Starting real video download process...
  `);
  
  const downloader = new RealVideoDownloader();
  
  // Show current status
  await downloader.showDownloadSummary();
  
  // Download real videos
  const downloads = await downloader.downloadRealVideos(10);
  
  console.log(`\n🎯 REAL DOWNLOAD COMPLETE!`);
  console.log(`✅ Downloaded ${downloads.length} real videos`);
  
  if (downloads.length > 0) {
    console.log('\n📹 Successfully downloaded:');
    downloads.forEach(download => {
      console.log(`   • ${download.filename} (${Math.round(download.filesize / 1024)}KB) - ${download.download_method}`);
    });
  } else {
    console.log('\n💡 No real videos downloaded yet.');
    console.log('Try configuring:');
    console.log('• Direct video URLs');
    console.log('• Proxy servers');
    console.log('• API endpoints');
  }
  
  // Show final summary
  await downloader.showDownloadSummary();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { RealVideoDownloader };