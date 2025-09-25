#!/usr/bin/env node

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

/**
 * Real Douyin Video Extractor
 * Sử dụng nhiều kỹ thuật bypass để crawl thật
 */

class RealDouyinExtractor {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  async launchWithProfile() {
    console.log('🚀 Launching browser với realistic profile...');
    
    // Tạo persistent browser context để simulate real user
    const userDataDir = path.join(__dirname, '..', '.browser-profile');
    
    this.browser = await chromium.launchPersistentContext(userDataDir, {
      headless: false, // Chạy với UI để debugging
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-first-run',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-features=TranslateUI,BlinkGenPropertyTrees',
        '--disable-ipc-flooding-protection'
      ],
      
      viewport: { width: 1366, height: 768 },
      
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
      
      extraHTTPHeaders: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"macOS"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
      }
    });
    
    this.page = this.browser.pages()[0] || await this.browser.newPage();
    
    // Enhanced stealth scripts
    await this.page.addInitScript(() => {
      // Override webdriver detection
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      
      // Override plugins array
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          { name: "Chrome PDF Plugin", filename: "internal-pdf-viewer" },
          { name: "Chromium PDF Plugin", filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai" },
          { name: "Microsoft Edge PDF Viewer", filename: "pdfjs" }
        ]
      });
      
      // Override permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
      );
      
      // Override chrome runtime
      window.chrome = {
        runtime: {
          onConnect: undefined,
          onMessage: undefined
        }
      };
      
      // Add realistic mouse/keyboard events
      let mouseX = 0, mouseY = 0;
      document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
      });
    });
    
    console.log('✅ Browser launched với advanced stealth measures');
  }

  async realHumanSimulation() {
    console.log('🤖 Advanced human simulation...');
    
    // Realistic page interaction
    await this.page.mouse.move(100, 100);
    await this.page.waitForTimeout(500);
    
    // Simulate reading behavior
    for (let i = 0; i < 5; i++) {
      await this.page.mouse.move(
        200 + Math.random() * 600,
        150 + i * 100 + Math.random() * 50
      );
      await this.page.waitForTimeout(200 + Math.random() * 300);
    }
    
    // Natural scrolling pattern
    const scrollSteps = [100, 250, 180, 320, 200, 150];
    for (const step of scrollSteps) {
      await this.page.evaluate((pixels) => {
        window.scrollBy({ top: pixels, behavior: 'smooth' });
      }, step);
      await this.page.waitForTimeout(800 + Math.random() * 1200);
    }
    
    console.log('✅ Human simulation completed');
  }

  async extractWithNetworkInterception(url) {
    console.log(`🌐 Loading với network interception: ${url}`);
    
    const interceptedRequests = [];
    const videoData = [];
    
    // Intercept network requests để capture API calls
    await this.page.route('**/*', async (route) => {
      const request = route.request();
      const url = request.url();
      
      // Log interesting requests
      if (url.includes('aweme') || url.includes('video') || url.includes('douyin')) {
        interceptedRequests.push({
          url: url,
          method: request.method(),
          headers: request.headers()
        });
        console.log(`📡 Intercepted: ${request.method()} ${url.slice(0, 100)}...`);
      }
      
      await route.continue();
    });
    
    // Load page
    await this.page.goto(url, { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    await this.realHumanSimulation();
    
    // Wait for dynamic content
    await this.page.waitForTimeout(5000);
    
    // Multiple extraction strategies
    const extractionResults = await this.page.evaluate(() => {
      const results = {
        pageInfo: {
          title: document.title,
          url: window.location.href,
          readyState: document.readyState
        },
        videos: [],
        apiData: [],
        errors: []
      };
      
      try {
        // Strategy 1: Find video containers
        const videoContainers = document.querySelectorAll('div[data-e2e*="video"], li[data-e2e*="video"], [class*="video-item"]');
        console.log('Found video containers:', videoContainers.length);
        
        videoContainers.forEach((container, index) => {
          const videoInfo = {
            index: index,
            className: container.className,
            dataset: container.dataset,
            innerHTML: container.innerHTML.slice(0, 200)
          };
          
          // Look for video ID in various attributes
          const possibleId = container.getAttribute('data-vid') ||
                            container.getAttribute('data-aweme-id') ||
                            container.querySelector('[data-vid]')?.getAttribute('data-vid');
          
          if (possibleId) {
            videoInfo.videoId = possibleId;
          }
          
          // Look for video URL
          const videoElement = container.querySelector('video');
          if (videoElement) {
            videoInfo.videoSrc = videoElement.src || videoElement.getAttribute('data-src');
          }
          
          // Look for links
          const links = container.querySelectorAll('a[href*="/video/"]');
          if (links.length > 0) {
            videoInfo.links = Array.from(links).map(link => link.href);
          }
          
          results.videos.push(videoInfo);
        });
        
        // Strategy 2: Check window objects for data
        if (window.__INITIAL_STATE__ || window.__NUXT__ || window._SSR_DATA_) {
          const globalData = window.__INITIAL_STATE__ || window.__NUXT__ || window._SSR_DATA_;
          results.apiData.push({
            type: 'global_state',
            keys: Object.keys(globalData || {})
          });
        }
        
        // Strategy 3: Check for XHR responses stored in DOM
        const scriptTags = document.querySelectorAll('script');
        scriptTags.forEach((script, index) => {
          if (script.textContent && script.textContent.includes('aweme')) {
            results.apiData.push({
              type: 'script_data',
              index: index,
              content: script.textContent.slice(0, 500)
            });
          }
        });
        
      } catch (error) {
        results.errors.push(error.message);
      }
      
      return results;
    });
    
    console.log(`📊 Extraction results:`, {
      videos: extractionResults.videos.length,
      apiData: extractionResults.apiData.length,
      interceptedRequests: interceptedRequests.length
    });
    
    return {
      extractionResults,
      interceptedRequests,
      pageAnalysis: extractionResults.pageInfo
    };
  }

  async tryMultipleUrls() {
    const testUrls = [
      'https://www.douyin.com/discover',
      'https://www.douyin.com/search/trending',
      'https://www.douyin.com/search/music?type=general',
      'https://www.douyin.com/?recommend=1',
      'https://m.douyin.com/search/music'
    ];
    
    for (const url of testUrls) {
      try {
        console.log(`\n🎯 Trying: ${url}`);
        const result = await this.extractWithNetworkInterception(url);
        
        if (result.extractionResults.videos.length > 0) {
          console.log(`✅ SUCCESS! Found ${result.extractionResults.videos.length} videos`);
          
          // Show detailed results
          result.extractionResults.videos.slice(0, 3).forEach((video, i) => {
            console.log(`   ${i+1}. Video ${video.videoId || 'Unknown ID'}`);
            if (video.links) {
              console.log(`      Links: ${video.links.join(', ')}`);
            }
          });
          
          return result;
        } else {
          console.log(`❌ No videos found on ${url}`);
        }
        
        // Wait between requests để avoid rate limiting
        await this.page.waitForTimeout(3000);
        
      } catch (error) {
        console.log(`❌ Error with ${url}: ${error.message}`);
      }
    }
    
    return null;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

// Main execution
async function main() {
  const extractor = new RealDouyinExtractor();
  
  try {
    await extractor.launchWithProfile();
    
    console.log('🔍 Attempting to extract real Douyin videos...');
    console.log('⚠️  Note: This will open a browser window for realistic simulation');
    
    const result = await extractor.tryMultipleUrls();
    
    if (result) {
      console.log('\n🎉 Real video extraction successful!');
      
      // Save results
      const outputFile = path.join(__dirname, '..', 'real-extraction-results.json');
      fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
      console.log(`📄 Results saved to: ${outputFile}`);
      
    } else {
      console.log('\n❌ Could not extract real videos from any URL');
      console.log('💡 Suggestions:');
      console.log('   1. Try running during peak hours (7-10 PM China time)');
      console.log('   2. Use residential proxy service');
      console.log('   3. Try mobile version: m.douyin.com');
      console.log('   4. Consider using Douyin mobile app API');
    }
    
  } catch (error) {
    console.error('💥 Extraction failed:', error.message);
  } finally {
    await extractor.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = { RealDouyinExtractor };