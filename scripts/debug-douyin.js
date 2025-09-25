#!/usr/bin/env node

const { chromium } = require('playwright');
require('dotenv').config();

async function debugDouyinPage(topic = 'decor') {
  console.log(`🔍 Debug Douyin Page: ${topic}`);
  
  const browser = await chromium.launch({ 
    headless: false, // Show browser for debugging
    slowMo: 1000,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  try {
    const url = `https://www.douyin.com/search/${encodeURIComponent(topic)}`;
    console.log(`🌐 Loading: ${url}`);
    
    await page.goto(url, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });

    // Wait and analyze
    console.log('⏳ Waiting 5 seconds for content...');
    await page.waitForTimeout(5000);

    // Get detailed page info
    const analysis = await page.evaluate(() => {
      const info = {
        title: document.title,
        url: window.location.href,
        bodyHTML: document.body?.innerHTML?.length || 0,
        bodyText: document.body?.innerText?.substring(0, 500) || '',
        
        // Check for common elements
        selectors: {
          'video tags': document.querySelectorAll('video').length,
          'video links': document.querySelectorAll('a[href*="/video/"]').length,
          'aweme links': document.querySelectorAll('a[href*="/aweme/"]').length,
          'data-e2e items': document.querySelectorAll('[data-e2e*="item"]').length,
          'data-testid': document.querySelectorAll('[data-testid]').length,
          'li elements': document.querySelectorAll('li').length,
          'div with video class': document.querySelectorAll('div[class*="video"]').length,
          'article elements': document.querySelectorAll('article').length,
          'img elements': document.querySelectorAll('img').length
        },
        
        // Sample links found
        sampleLinks: Array.from(document.querySelectorAll('a[href*="/video/"]'))
          .slice(0, 3)
          .map(a => ({ href: a.href, text: a.textContent?.trim()?.substring(0, 50) })),
          
        // Check for React/Vue indicators
        frameworks: {
          react: !!document.querySelector('[data-reactroot], #root'),
          vue: !!document.querySelector('[data-v-]'),
          angular: !!document.querySelector('[ng-app]')
        },
        
        // Check for loading indicators
        loading: {
          spinners: document.querySelectorAll('[class*="loading"], [class*="spinner"]').length,
          skeletons: document.querySelectorAll('[class*="skeleton"]').length
        },
        
        // Get all classes that might be video containers
        videoClasses: Array.from(document.querySelectorAll('div[class*="video"], div[class*="item"]'))
          .slice(0, 5)
          .map(el => el.className),
          
        // Check for infinite scroll indicators
        scrollIndicators: {
          height: document.body.scrollHeight,
          innerHeight: window.innerHeight,
          scrollable: document.body.scrollHeight > window.innerHeight
        }
      };
      
      return info;
    });

    console.log('\n📊 Page Analysis:');
    console.log('Title:', analysis.title);
    console.log('URL:', analysis.url);
    console.log('Body HTML length:', analysis.bodyHTML);
    console.log('Body text preview:', analysis.bodyText);
    
    console.log('\n🔍 Element Counts:');
    Object.entries(analysis.selectors).forEach(([key, count]) => {
      console.log(`  ${key}: ${count}`);
    });
    
    console.log('\n🔗 Sample Video Links:');
    analysis.sampleLinks.forEach((link, i) => {
      console.log(`  ${i+1}. ${link.href} - "${link.text}"`);
    });
    
    console.log('\n⚙️ Frameworks detected:', analysis.frameworks);
    console.log('🔄 Loading indicators:', analysis.loading);
    console.log('📜 Scroll info:', analysis.scrollIndicators);
    
    console.log('\n🎨 Video container classes:');
    analysis.videoClasses.forEach((className, i) => {
      console.log(`  ${i+1}. ${className}`);
    });

    // Try scrolling and see if more content loads
    console.log('\n📜 Testing scroll behavior...');
    const initialCount = analysis.selectors['video links'];
    
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    
    await page.waitForTimeout(3000);
    
    const afterScrollCount = await page.evaluate(() => {
      return document.querySelectorAll('a[href*="/video/"]').length;
    });
    
    console.log(`Video links before scroll: ${initialCount}`);
    console.log(`Video links after scroll: ${afterScrollCount}`);
    console.log(`New content loaded: ${afterScrollCount > initialCount ? 'YES' : 'NO'}`);

    // Take screenshot
    await page.screenshot({ path: 'douyin-debug.png', fullPage: true });
    console.log('\n📸 Screenshot saved as douyin-debug.png');
    
    console.log('\n⏸️  Browser will stay open for 30 seconds for manual inspection...');
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

// Run with topic from command line or default to 'decor'
const topic = process.argv[2] || 'decor';
debugDouyinPage(topic).catch(console.error);