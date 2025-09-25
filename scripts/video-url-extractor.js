#!/usr/bin/env node

/**
 * 🔍 REAL VIDEO URL EXTRACTOR
 * 
 * Extract actual video URLs from Douyin for direct download
 */

const { chromium } = require('playwright');
const axios = require('axios');

class VideoURLExtractor {
  constructor() {
    this.extractedUrls = new Set();
  }

  /**
   * 🎯 Extract real video URLs from Douyin
   */
  async extractRealVideoURLs() {
    console.log('🔍 Extracting real video URLs from Douyin...');
    
    const methods = [
      () => this.extractFromNetworkCapture(),
      () => this.extractFromPageSource(),
      () => this.extractFromAPIRequests()
    ];
    
    const allUrls = [];
    
    for (const method of methods) {
      try {
        const urls = await method();
        allUrls.push(...urls);
      } catch (error) {
        console.log('⚠️ Extraction method failed:', error.message);
      }
    }
    
    const uniqueUrls = [...new Set(allUrls)];
    console.log(`✅ Extracted ${uniqueUrls.length} unique video URLs`);
    
    return uniqueUrls;
  }

  /**
   * 📡 Method 1: Network request capture
   */
  async extractFromNetworkCapture() {
    console.log('📡 Capturing network requests...');
    
    const browser = await chromium.launch({
      headless: false,
      args: [
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--no-sandbox'
      ]
    });
    
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15',
      viewport: { width: 375, height: 812 }
    });
    
    const page = await context.newPage();
    const videoUrls = [];
    
    // Intercept all requests
    page.on('request', request => {
      const url = request.url();
      if (this.isVideoUrl(url)) {
        console.log('🎥 Video request:', url);
        videoUrls.push(url);
      }
    });
    
    page.on('response', async response => {
      const url = response.url();
      const contentType = response.headers()['content-type'] || '';
      
      if (contentType.includes('video/') || this.isVideoUrl(url)) {
        console.log('📹 Video response:', url);
        videoUrls.push(url);
      }
      
      // Check for JSON responses with video data
      if (contentType.includes('application/json')) {
        try {
          const data = await response.json();
          const extractedUrls = this.extractVideoUrlsFromJSON(data);
          videoUrls.push(...extractedUrls);
        } catch (e) {
          // Ignore JSON parse errors
        }
      }
    });
    
    try {
      console.log('🌐 Loading Douyin homepage...');
      await page.goto('https://www.douyin.com', { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });
      
      // Wait for initial load
      await page.waitForTimeout(3000);
      
      // Try to find and click video elements
      try {
        // Look for video containers
        const videoElements = await page.$$('video, [data-e2e="feed-item"]');
        console.log(`Found ${videoElements.length} potential video elements`);
        
        // Click on first few videos to trigger loading
        for (let i = 0; i < Math.min(3, videoElements.length); i++) {
          try {
            await videoElements[i].click({ timeout: 2000 });
            await page.waitForTimeout(2000);
          } catch (e) {
            // Ignore click errors
          }
        }
      } catch (e) {
        console.log('⚠️ Could not interact with video elements');
      }
      
      // Scroll to trigger more video loading
      for (let scroll = 0; scroll < 5; scroll++) {
        await page.evaluate(() => window.scrollBy(0, 1000));
        await page.waitForTimeout(2000);
      }
      
    } catch (error) {
      console.log('❌ Page loading failed:', error.message);
    }
    
    await browser.close();
    
    const uniqueUrls = [...new Set(videoUrls)];
    console.log(`📡 Network capture found ${uniqueUrls.length} video URLs`);
    
    return uniqueUrls;
  }

  /**
   * 📄 Method 2: Extract from page source
   */
  async extractFromPageSource() {
    console.log('📄 Analyzing page source...');
    
    try {
      const response = await axios.get('https://www.douyin.com', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: 15000
      });
      
      const html = response.data;
      const videoUrls = [];
      
      // Extract video URLs from various patterns
      const patterns = [
        /https?:\/\/[^"'\s]*\.mp4[^"'\s]*/gi,
        /https?:\/\/v\d+.*?\.douyinvod\.com[^"'\s]*/gi,
        /https?:\/\/.*?\/video\/[^"'\s]*/gi,
        /"play_url":\s*"([^"]+)"/gi,
        /"download_url":\s*"([^"]+)"/gi
      ];
      
      for (const pattern of patterns) {
        const matches = html.match(pattern) || [];
        videoUrls.push(...matches);
      }
      
      // Also look for base64 encoded data
      const base64Pattern = /data:video\/mp4;base64,([A-Za-z0-9+/=]+)/gi;
      const base64Matches = html.match(base64Pattern) || [];
      
      console.log(`📄 Page source found ${videoUrls.length} URLs, ${base64Matches.length} base64 videos`);
      
      return [...videoUrls, ...base64Matches];
      
    } catch (error) {
      console.log('❌ Page source analysis failed:', error.message);
      return [];
    }
  }

  /**
   * 🔌 Method 3: Direct API requests
   */
  async extractFromAPIRequests() {
    console.log('🔌 Testing direct API requests...');
    
    const apiEndpoints = [
      'https://www.douyin.com/aweme/v1/web/aweme/feed/',
      'https://www.douyin.com/aweme/v1/web/hot/search/list/',
      'https://www.douyin.com/web-api/v2/aweme/iteminfo/',
      'https://www.douyin.com/api/recommend/item_list/'
    ];
    
    const videoUrls = [];
    
    for (const endpoint of apiEndpoints) {
      try {
        console.log(`🔌 Testing API: ${endpoint}`);
        
        const response = await axios.get(endpoint, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15',
            'Referer': 'https://www.douyin.com/',
            'Accept': 'application/json, text/plain, */*'
          },
          timeout: 10000
        });
        
        const data = response.data;
        const extractedUrls = this.extractVideoUrlsFromJSON(data);
        
        console.log(`✅ API ${endpoint} returned ${extractedUrls.length} video URLs`);
        videoUrls.push(...extractedUrls);
        
      } catch (error) {
        console.log(`❌ API ${endpoint} failed: ${error.message}`);
      }
    }
    
    return videoUrls;
  }

  /**
   * 🔍 Extract video URLs from JSON data
   */
  extractVideoUrlsFromJSON(data) {
    const urls = [];
    
    if (!data || typeof data !== 'object') return urls;
    
    // Recursive function to find video URLs in nested objects
    const findUrls = (obj, path = '') => {
      if (typeof obj === 'string' && this.isVideoUrl(obj)) {
        urls.push(obj);
        return;
      }
      
      if (Array.isArray(obj)) {
        obj.forEach((item, index) => findUrls(item, `${path}[${index}]`));
        return;
      }
      
      if (typeof obj === 'object' && obj !== null) {
        for (const [key, value] of Object.entries(obj)) {
          const currentPath = path ? `${path}.${key}` : key;
          
          // Look for common video URL keys
          if (key.includes('url') || key.includes('play') || key.includes('download') || key.includes('video')) {
            if (typeof value === 'string' && this.isVideoUrl(value)) {
              urls.push(value);
            } else if (Array.isArray(value)) {
              value.forEach(item => {
                if (typeof item === 'string' && this.isVideoUrl(item)) {
                  urls.push(item);
                }
              });
            }
          }
          
          findUrls(value, currentPath);
        }
      }
    };
    
    findUrls(data);
    return [...new Set(urls)]; // Remove duplicates
  }

  /**
   * 🎯 Check if URL is a video URL
   */
  isVideoUrl(url) {
    if (typeof url !== 'string') return false;
    
    const videoPatterns = [
      /\.mp4(\?|$)/i,
      /\.m3u8(\?|$)/i,
      /\.flv(\?|$)/i,
      /douyinvod\.com/i,
      /\/video\//i,
      /aweme.*video/i,
      /play_url/i,
      /download_url/i
    ];
    
    return videoPatterns.some(pattern => pattern.test(url));
  }

  /**
   * 💾 Save extracted URLs to file
   */
  async saveURLsToFile(urls) {
    const fs = require('fs').promises;
    const path = require('path');
    
    const urlData = {
      extraction_time: new Date().toISOString(),
      total_urls: urls.length,
      urls: urls.map(url => ({
        url,
        type: this.getVideoType(url),
        estimated_size: 'unknown'
      }))
    };
    
    const outputPath = path.join(__dirname, '..', 'extracted-video-urls.json');
    await fs.writeFile(outputPath, JSON.stringify(urlData, null, 2));
    
    console.log(`💾 Saved ${urls.length} URLs to: extracted-video-urls.json`);
    
    return outputPath;
  }

  /**
   * 🎬 Get video type from URL
   */
  getVideoType(url) {
    if (url.includes('.mp4')) return 'mp4';
    if (url.includes('.m3u8')) return 'hls';
    if (url.includes('.flv')) return 'flv';
    if (url.includes('douyinvod.com')) return 'douyin-native';
    return 'unknown';
  }

  /**
   * 📊 Show extraction summary
   */
  showExtractionSummary(urls) {
    console.log(`\n📊 EXTRACTION SUMMARY:`);
    console.log(`• Total unique URLs: ${urls.length}`);
    
    const typeCount = {};
    urls.forEach(url => {
      const type = this.getVideoType(url);
      typeCount[type] = (typeCount[type] || 0) + 1;
    });
    
    console.log('• URL types:');
    Object.entries(typeCount).forEach(([type, count]) => {
      console.log(`  - ${type}: ${count}`);
    });
    
    console.log('\n📹 Sample URLs:');
    urls.slice(0, 3).forEach((url, index) => {
      console.log(`  ${index + 1}. ${url.length > 80 ? url.substring(0, 80) + '...' : url}`);
    });
  }
}

// Main execution
async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                   🔍 REAL VIDEO URL EXTRACTOR                        ║
╚══════════════════════════════════════════════════════════════════════╝

Extract actual video URLs from Douyin for direct download
Methods: Network capture, Page source analysis, API requests
  `);
  
  const extractor = new VideoURLExtractor();
  const urls = await extractor.extractRealVideoURLs();
  
  if (urls.length > 0) {
    extractor.showExtractionSummary(urls);
    await extractor.saveURLsToFile(urls);
    
    console.log('\n🎯 URLs ready for download!');
    console.log('Next step: Use these URLs in real-video-downloader.js');
  } else {
    console.log('\n❌ No video URLs extracted');
    console.log('💡 Possible reasons:');
    console.log('• Douyin anti-bot protection');
    console.log('• Network restrictions');
    console.log('• Site structure changes');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { VideoURLExtractor };