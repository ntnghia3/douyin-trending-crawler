// crawler-github.js
// Run: node crawler-github.js
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { chromium } = require('playwright');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEBUG = (process.env.DEBUG || 'true').toLowerCase() === 'true';
const LIMIT = parseInt(process.env.LIMIT || '20', 10);

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
  process.exit(1);
}

function mkDebugDir() {
  const dir = path.join(process.cwd(), 'debug');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function scrapeDouyin(limit = 20) {
  console.log('=> Launching browser');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
  });

  console.log('=> Navigating to Douyin hot page...');
  // use /hot or /discover - both tried
  const urlCandidates = ['https://www.douyin.com/hot', 'https://www.douyin.com/discover'];
  let lastHtml = '';
  let items = [];

  for (const url of urlCandidates) {
    try {
      console.log(`--> goto ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(2500);
      for (let i = 0; i < 6; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.8));
        await page.waitForTimeout(800);
      }

      const html = await page.content();
      lastHtml = html;
      console.log('--> page.content length:', html.length);

      if (DEBUG) {
        const dir = mkDebugDir();
        const stamp = Date.now();
        const fname = path.join(dir, `page-${stamp}.html`);
        fs.writeFileSync(fname, html, 'utf8');
        console.log('--> saved debug html:', fname);
      }

      // 1) try anchors
      items = await page.$$eval('a[href*="/video/"]', (els) =>
        els.map((el) => {
          const href = el.getAttribute('href') || '';
          const douyin_id = href.split('/').pop() || null;
          const p = el.querySelector('p');
          const title = p ? p.innerText.trim() : (el.getAttribute('title') || '');
          const img = el.querySelector('img');
          const thumb = img ? (img.src || img.getAttribute('data-src') || null) : null;
          const video_url = href.startsWith('http') ? href : ('https://www.douyin.com' + href);
          return douyin_id ? { douyin_id, title, video_url, thumbnail_url: thumb } : null;
        }).filter(Boolean)
      );

      console.log('--> anchors found:', items.length);
      if (items.length >= 1) {
        // trim to limit and return
        items = items.slice(0, limit);
        await browser.close();
        return items;
      }

      // 2) fallback: scan script tags for /video/<id>
      console.log('--> fallback: scanning scripts for /video/ pattern');
      const scriptsText = await page.$$eval('script', s => s.map(x => x.innerText).filter(Boolean).slice(0, 40));
      if (DEBUG) {
        const dir = mkDebugDir();
        const fname = path.join(dir, `scripts-${Date.now()}.txt`);
        fs.writeFileSync(fname, scriptsText.join('\n\n/* --- */\n\n'), 'utf8');
        console.log('--> saved debug scripts to', fname);
      }

      const ids = new Set();
      const re = /\/video\/([0-9A-Za-z_-]{6,})/g;
      for (const txt of scriptsText) {
        let m;
        while ((m = re.exec(txt)) !== null) {
          ids.add(m[1]);
          if (ids.size >= limit) break;
        }
        if (ids.size >= limit) break;
      }
      console.log('--> ids found in scripts:', ids.size);
      if (ids.size > 0) {
        items = Array.from(ids).slice(0, limit).map(id => ({
          douyin_id: id,
          title: `Douyin ${id}`,
          video_url: `https://www.douyin.com/video/${id}`,
          thumbnail_url: null
        }));
        await browser.close();
        return items;
      }

      // 3) fallback: try reading common global vars in page (best-effort)
      console.log('--> fallback: try reading window variables for JSON payloads (best-effort)');
      const maybeData = await page.evaluate(() => {
        try {
          const candidates = [];
          // try well-known keys
          const keys = ['__INITIAL_STATE__', '__INIT_PROPS__', '__SSR_DATA__', 'SIG_INIT_DATA'];
          for (const k of keys) {
            if (window[k]) candidates.push({ key: k, val: window[k] });
          }
          // also scan for any top-level arrays containing objects with 'aweme' or 'video'
          for (const k in window) {
            try {
              const v = window[k];
              if (v && typeof v === 'object') {
                if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object') {
                  const sample = JSON.stringify(v[0]);
                  if (/video/.test(sample) || /aweme/.test(sample) || /cover/.test(sample) || /author/.test(sample)) {
                    candidates.push({ key: k, sample: v[0] });
                  }
                }
              }
            } catch (e) {}
          }
          return candidates.slice(0, 5);
        } catch (e) {
          return null;
        }
      });
      if (maybeData && maybeData.length) {
        if (DEBUG) {
          const dir = mkDebugDir();
          fs.writeFileSync(path.join(dir, `window-data-${Date.now()}.json`), JSON.stringify(maybeData, null, 2), 'utf8');
          console.log('--> saved window-data debug');
        }
        // try to extract ids from these candidate objects
        const ids2 = new Set();
        const jsonRe = /\/video\/([0-9A-Za-z_-]{6,})/g;
        const text = JSON.stringify(maybeData);
        let mm;
        while ((mm = jsonRe.exec(text)) !== null) ids2.add(mm[1]);
        if (ids2.size > 0) {
          items = Array.from(ids2).slice(0, limit).map(id => ({
            douyin_id: id,
            title: `Douyin ${id}`,
            video_url: `https://www.douyin.com/video/${id}`,
            thumbnail_url: null
          }));
          await browser.close();
          return items;
        }
      }

      // if nothing found, continue to next url candidate
    } catch (err) {
      console.warn('Error during page processing:', err && err.message);
    }
  } // end for urlCandidates

  await browser.close();
  // final fallback: return empty
  return [];
}

async function upsertToSupabase(videos) {
  if (!videos || !videos.length) {
    console.log('No videos to upsert.');
    return { inserted: 0 };
  }

  const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/videos`;
  try {
    console.log(`Upserting ${videos.length} records to ${url} (on_conflict=douyin_id)`);

    const res = await axios.post(url, videos, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates, return=representation'
      },
      params: {
        on_conflict: 'douyin_id'
      },
      timeout: 45000
    });

    console.log('Supabase response status:', res.status);
    if (res.data) {
      if (DEBUG) {
        const dir = mkDebugDir();
        const fname = path.join(dir, `upsert-response-${Date.now()}.json`);
        fs.writeFileSync(fname, JSON.stringify(res.data, null, 2), 'utf8');
        console.log('--> saved upsert response to', fname);
      }
      return { inserted: Array.isArray(res.data) ? res.data.length : 0, data: res.data };
    }
    return { inserted: 0 };
  } catch (err) {
    console.error('Upsert error:', err.response ? err.response.data : err.message);
    throw err;
  }
}

(async () => {
  try {
    console.log('=== Douyin scraper started ===');
    const videos = await scrapeDouyin(LIMIT);
    console.log('Scraped videos count:', videos.length);
    if (DEBUG) {
      const dir = mkDebugDir();
      const fname = path.join(dir, `scraped-${Date.now()}.json`);
      fs.writeFileSync(fname, JSON.stringify(videos, null, 2), 'utf8');
      console.log('--> saved scraped JSON to', fname);
    }
    const r = await upsertToSupabase(videos);
    console.log('Upsert result:', r);
    process.exit(0);
  } catch (e) {
    console.error('Fatal error in scraper:', e && e.message);
    process.exit(2);
  }
})();
