#!/usr/bin/env node

const { chromium } = require('playwright');

async function testDouyinAccess() {
  console.log('🔍 Testing Douyin access...');
  
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });
  
  try {
    console.log('🌐 Trying to access Douyin homepage...');
    await page.goto('https://www.douyin.com/', { timeout: 15000 });
    
    console.log('✅ Homepage loaded successfully');
    
    const title = await page.title();
    console.log(`📄 Page title: ${title}`);
    
    // Wait for any content to load
    await page.waitForTimeout(5000);
    
    // Take screenshot for debugging
    await page.screenshot({ path: 'douyin-test.png' });
    console.log('📸 Screenshot saved as douyin-test.png');
    
  } catch (error) {
    console.error('❌ Error accessing Douyin:', error.message);
  } finally {
    await browser.close();
  }
}

testDouyinAccess().catch(console.error);