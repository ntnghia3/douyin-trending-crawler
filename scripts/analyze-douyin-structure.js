const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

class DouyinStructureAnalyzer {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async launch() {
    console.log('🚀 Launching browser for Douyin structure analysis...');
    this.browser = await chromium.launch({ 
      headless: true,   // Must be headless in container environment
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    this.page = await this.browser.newPage();
    
    // Set realistic headers
    await this.page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    });
  }

  async analyzeSearchPage(topic = 'decor') {
    const url = `https://www.douyin.com/search/${encodeURIComponent(topic)}`;
    console.log(`\n📍 Analyzing: ${url}`);
    
    try {
      // Navigate to page
      console.log('   ⏳ Loading page...');
      await this.page.goto(url, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
      
      // Wait for network to be mostly idle
      console.log('   ⏳ Waiting for network to settle...');
      try {
        await this.page.waitForLoadState('networkidle', { timeout: 20000 });
      } catch (e) {
        console.log('   ⚠️  Network still active, continuing...');
      }
      
      // Scroll to trigger lazy loading
      console.log('   📜 Scrolling to trigger content loading...');
      await this.page.evaluate(() => {
        window.scrollTo(0, window.innerHeight * 2);
      });
      await this.page.waitForTimeout(3000);
      
      // Scroll back up
      await this.page.evaluate(() => {
        window.scrollTo(0, 0);
      });
      await this.page.waitForTimeout(2000);
      
      console.log('\n🔍 DETAILED PAGE ANALYSIS:');
      
      // 1. Basic page info
      const title = await this.page.title();
      const url_current = this.page.url();
      console.log(`   📄 Title: ${title}`);
      console.log(`   🔗 Current URL: ${url_current}`);
      
      // 2. Check for React/Vue indicators
      const frameworks = await this.page.evaluate(() => {
        const indicators = {
          react: !!window.React || !!document.querySelector('[data-reactroot]') || 
                 !!document.querySelector('#root') || !!document.querySelector('#app'),
          vue: !!window.Vue || !!document.querySelector('[data-server-rendered]'),
          jquery: !!window.jQuery || !!window.$
        };
        return indicators;
      });
      console.log(`   ⚛️  Framework Detection:`, frameworks);
      
      // 3. Find all possible container elements
      const containers = await this.page.evaluate(() => {
        const selectors = [
          '#root', '#app', '.container', '.content', '.main',
          '[class*="video"]', '[class*="item"]', '[class*="card"]',
          '[class*="list"]', '[class*="grid"]', '[class*="feed"]',
          '[id*="video"]', '[id*="content"]', '[id*="search"]'
        ];
        
        const found = [];
        selectors.forEach(sel => {
          const elements = document.querySelectorAll(sel);
          if (elements.length > 0) {
            found.push({
              selector: sel,
              count: elements.length,
              classes: Array.from(elements).slice(0, 3).map(el => el.className),
              ids: Array.from(elements).slice(0, 3).map(el => el.id)
            });
          }
        });
        return found;
      });
      
      console.log('\n   📦 Container Elements Found:');
      containers.forEach(container => {
        console.log(`      ${container.selector}: ${container.count} elements`);
        if (container.classes.some(c => c)) {
          console.log(`         Classes: ${container.classes.filter(c => c).join(', ')}`);
        }
        if (container.ids.some(i => i)) {
          console.log(`         IDs: ${container.ids.filter(i => i).join(', ')}`);
        }
      });
      
      // 4. Look for specific Douyin elements
      const douyinElements = await this.page.evaluate(() => {
        const searches = [
          { name: 'Video Links', selector: 'a[href*="/video/"]' },
          { name: 'User Links', selector: 'a[href*="/user/"]' },
          { name: 'Video Images', selector: 'img[src*="video"], img[alt*="video"]' },
          { name: 'Play Buttons', selector: '[class*="play"], [class*="Play"]' },
          { name: 'Video Titles', selector: '[class*="title"], [class*="Title"]' },
          { name: 'Like Buttons', selector: '[class*="like"], [class*="Like"]' },
          { name: 'Comment Buttons', selector: '[class*="comment"], [class*="Comment"]' },
          { name: 'Share Buttons', selector: '[class*="share"], [class*="Share"]' },
          { name: 'Data Attributes', selector: '[data-e2e*="video"], [data-e2e*="search"]' }
        ];
        
        return searches.map(search => ({
          name: search.name,
          selector: search.selector,
          count: document.querySelectorAll(search.selector).length,
          samples: Array.from(document.querySelectorAll(search.selector))
            .slice(0, 2)
            .map(el => ({
              tagName: el.tagName,
              className: el.className,
              id: el.id,
              text: el.textContent?.slice(0, 50) || '',
              href: el.href || ''
            }))
        }));
      });
      
      console.log('\n   🎯 Douyin-Specific Elements:');
      douyinElements.forEach(element => {
        console.log(`      ${element.name}: ${element.count} found`);
        if (element.samples.length > 0) {
          element.samples.forEach((sample, i) => {
            console.log(`         [${i+1}] ${sample.tagName} class="${sample.className}" text="${sample.text}"`);
            if (sample.href) console.log(`             href="${sample.href}"`);
          });
        }
      });
      
      // 5. Get page HTML structure sample
      const htmlStructure = await this.page.evaluate(() => {
        const body = document.body;
        const getElementInfo = (el, depth = 0) => {
          if (depth > 3) return '...';
          
          const info = `${'  '.repeat(depth)}<${el.tagName.toLowerCase()}`;
          const attrs = [];
          if (el.id) attrs.push(`id="${el.id}"`);
          if (el.className) attrs.push(`class="${el.className.slice(0, 50)}"`);
          
          let result = info + (attrs.length ? ' ' + attrs.join(' ') : '') + '>';
          
          const children = Array.from(el.children).slice(0, 5);
          children.forEach(child => {
            result += '\n' + getElementInfo(child, depth + 1);
          });
          
          if (el.children.length > 5) {
            result += '\n' + '  '.repeat(depth + 1) + `... and ${el.children.length - 5} more children`;
          }
          
          return result;
        };
        
        return getElementInfo(body);
      });
      
      console.log('\n   🌳 HTML Structure Sample:');
      console.log(htmlStructure.split('\n').slice(0, 30).join('\n'));
      
      // 6. Save full HTML for analysis
      const html = await this.page.content();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `douyin-analysis-${timestamp}.html`;
      const filepath = path.join(__dirname, '..', 'debug', filename);
      
      // Create debug directory if it doesn't exist
      const debugDir = path.dirname(filepath);
      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
      }
      
      fs.writeFileSync(filepath, html);
      console.log(`\n   💾 Full HTML saved to: ${filename}`);
      
      // 7. Take screenshot
      const screenshotPath = filepath.replace('.html', '.png');
      await this.page.screenshot({ 
        path: screenshotPath, 
        fullPage: true 
      });
      console.log(`   📸 Screenshot saved to: ${path.basename(screenshotPath)}`);
      
      console.log('\n✅ Analysis complete!');
      
    } catch (error) {
      console.error('❌ Analysis failed:', error.message);
      throw error;
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

// Main execution
async function main() {
  const analyzer = new DouyinStructureAnalyzer();
  
  try {
    await analyzer.launch();
    await analyzer.analyzeSearchPage('decor');
  } catch (error) {
    console.error('❌ Script failed:', error.message);
  } finally {
    await analyzer.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = { DouyinStructureAnalyzer };