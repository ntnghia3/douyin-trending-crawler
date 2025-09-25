#!/usr/bin/env node

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

/**
 * Advanced Anti-Detection Crawler for Douyin
 * Sử dụng các kỹ thuật advanced để bypass bot detection
 */

class AdvancedDouyinCrawler {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async launch() {
    console.log('🚀 Launching Advanced Anti-Detection Browser...');
    
    // Advanced browser configuration để tránh detection
    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-features=VizDisplayCompositor',
        
        // Anti-detection flags
        '--disable-blink-features=AutomationControlled',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-client-side-phishing-detection',
        '--disable-default-apps',
        '--disable-extensions',
        '--disable-hang-monitor',
        '--disable-ipc-flooding-protection',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--disable-sync',
        '--disable-translate',
        '--metrics-recording-only',
        '--no-default-browser-check',
        '--safebrowsing-disable-auto-update',
        '--enable-automation',
        '--password-store=basic',
        '--use-mock-keychain'
      ]
    });
    
    const context = await this.browser.newContext({
      // Realistic viewport
      viewport: { width: 1366, height: 768 },
      
      // Realistic user agent
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      
      // Extra headers để tránh detection
      extraHTTPHeaders: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0'
      },
      
      // Locale settings
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai'
    });
    
    this.page = await context.newPage();
    
    // Override navigator properties để hide automation
    await this.page.addInitScript(() => {
      // Remove webdriver property
      delete Object.getPrototypeOf(navigator).webdriver;
      
      // Override plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5]
      });
      
      // Override languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['zh-CN', 'zh', 'en']
      });
      
      // Override permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
    });
    
    console.log('✅ Advanced browser launched with anti-detection measures');
  }

  async crawlWithStealth(url) {
    console.log(`🎯 Crawling with stealth mode: ${url}`);
    
    try {
      // Navigate với realistic behavior
      await this.page.goto(url, { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });
      
      // Simulate human-like behavior
      await this.humanLikeBehavior();
      
      // Check page content
      const pageAnalysis = await this.analyzePage();
      
      if (pageAnalysis.isBlocked) {
        console.log('🚫 Page is blocked, trying alternative approach...');
        return await this.tryAlternativeApproach(url);
      }
      
      // Extract videos với advanced selectors
      const videos = await this.extractVideosAdvanced();
      
      return {
        success: true,
        videos: videos,
        analysis: pageAnalysis
      };
      
    } catch (error) {
      console.error('❌ Crawl failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  async humanLikeBehavior() {
    console.log('🤖 Simulating human behavior...');
    
    // Random mouse movements
    await this.page.mouse.move(
      Math.random() * 800 + 100,
      Math.random() * 600 + 100
    );
    
    // Random scroll
    await this.page.evaluate(() => {
      window.scrollTo(0, Math.random() * 500);
    });
    await this.page.waitForTimeout(1000 + Math.random() * 2000);
    
    // More realistic scrolling
    for (let i = 0; i < 3; i++) {
      await this.page.evaluate(() => {
        window.scrollBy(0, 200 + Math.random() * 300);
      });
      await this.page.waitForTimeout(500 + Math.random() * 1000);
    }
    
    console.log('✅ Human behavior simulation completed');
  }

  async analyzePage() {
    return await this.page.evaluate(() => {
      const analysis = {
        title: document.title,
        url: window.location.href,
        hasVideos: false,
        isBlocked: false,
        videoCount: 0,
        selectors: {}
      };
      
      // Check for blocking indicators
      const blockingKeywords = ['验证码', 'verification', 'captcha', '中间页', 'blocked'];
      const bodyText = document.body.innerText.toLowerCase();
      const title = document.title.toLowerCase();
      
      analysis.isBlocked = blockingKeywords.some(keyword => 
        bodyText.includes(keyword) || title.includes(keyword)
      );
      
      // Advanced video detection
      const videoSelectors = [
        'a[href*="/video/"]',
        'a[href*="/aweme/"]',
        '[data-e2e*="video"]',
        '[class*="video"]',
        'video',
        '[src*=".mp4"]',
        '[data-src*=".mp4"]'
      ];
      
      videoSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        analysis.selectors[selector] = elements.length;
        if (elements.length > 0) {
          analysis.hasVideos = true;
          analysis.videoCount += elements.length;
        }
      });
      
      return analysis;
    });
  }

  async extractVideosAdvanced() {
    console.log('🔍 Extracting videos with advanced methods...');
    
    return await this.page.evaluate(() => {
      const videos = [];
      
      // Method 1: Direct video links
      const videoLinks = document.querySelectorAll('a[href*="/video/"]');
      videoLinks.forEach(link => {
        const videoId = link.href.match(/video\/([^/?]+)/)?.[1];
        if (videoId) {
          videos.push({
            douyin_id: videoId,
            video_url: link.href,
            method: 'direct_link',
            element_info: link.textContent.slice(0, 100)
          });
        }
      });
      
      // Method 2: Data attributes
      const dataElements = document.querySelectorAll('[data-e2e*="video"], [data-vid]');
      dataElements.forEach(el => {
        const videoId = el.getAttribute('data-vid') || 
                       el.getAttribute('data-e2e')?.match(/\d+/)?.[0];
        if (videoId) {
          videos.push({
            douyin_id: videoId,
            method: 'data_attribute',
            element: el.tagName
          });
        }
      });
      
      // Method 3: Network requests inspection (if available)
      if (window.performance && window.performance.getEntriesByType) {
        const networkEntries = window.performance.getEntriesByType('resource');
        networkEntries.forEach(entry => {
          if (entry.name.includes('/video/') || entry.name.includes('douyin.com')) {
            const videoId = entry.name.match(/video\/([^/?]+)/)?.[1] ||
                           entry.name.match(/aweme_id=([^&]+)/)?.[1];
            if (videoId) {
              videos.push({
                douyin_id: videoId,
                video_url: entry.name,
                method: 'network_trace'
              });
            }
          }
        });
      }
      
      // Remove duplicates
      const uniqueVideos = videos.filter((video, index, self) => 
        index === self.findIndex(v => v.douyin_id === video.douyin_id)
      );
      
      return uniqueVideos;
    });
  }

  async tryAlternativeApproach(originalUrl) {
    console.log('🔄 Trying alternative approaches...');
    
    const alternatives = [
      // Mobile version
      originalUrl.replace('www.douyin.com', 'm.douyin.com'),
      // Different endpoints  
      originalUrl.replace('/search/', '/discover/'),
      // Add parameters to look different
      originalUrl + (originalUrl.includes('?') ? '&' : '?') + 'from=web&source=search'
    ];
    
    for (const altUrl of alternatives) {
      try {
        console.log(`   🔄 Trying: ${altUrl}`);
        await this.page.goto(altUrl, { waitUntil: 'networkidle', timeout: 20000 });
        
        await this.humanLikeBehavior();
        
        const analysis = await this.analyzePage();
        if (!analysis.isBlocked && analysis.hasVideos) {
          console.log('   ✅ Alternative approach successful!');
          const videos = await this.extractVideosAdvanced();
          return { success: true, videos, analysis };
        }
      } catch (error) {
        console.log(`   ❌ Alternative ${altUrl} failed: ${error.message}`);
      }
    }
    
    return { success: false, error: 'All alternatives failed' };
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

// Test advanced crawler
async function testAdvancedCrawler() {
  const crawler = new AdvancedDouyinCrawler();
  
  try {
    await crawler.launch();
    
    const testUrls = [
      'https://www.douyin.com/search/music',
      'https://www.douyin.com/search/dance',
      'https://www.douyin.com/recommend'
    ];
    
    for (const url of testUrls) {
      console.log(`\n🎯 Testing: ${url}`);
      const result = await crawler.crawlWithStealth(url);
      
      if (result.success) {
        console.log(`✅ Success! Found ${result.videos.length} videos`);
        result.videos.slice(0, 3).forEach((video, i) => {
          console.log(`   ${i+1}. ${video.douyin_id} (${video.method})`);
        });
      } else {
        console.log(`❌ Failed: ${result.error}`);
      }
    }
    
  } catch (error) {
    console.error('💥 Test failed:', error.message);
  } finally {
    await crawler.close();
  }
}

if (require.main === module) {
  testAdvancedCrawler();
}

module.exports = { AdvancedDouyinCrawler };