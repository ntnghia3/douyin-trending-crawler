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
// Optional topic (tag or search query). Priority:
// 1) config/topic.txt (or topic.txt at repo root)
// 2) env TOPIC
// 3) first CLI arg
function readTopicFromFile() {
  const candidates = [
    path.join(process.cwd(), 'config', 'topic.txt'),
    path.join(process.cwd(), 'topic.txt')
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const s = fs.readFileSync(p, 'utf8').trim();
        if (s) return s.split('\n')[0].trim();
      }
    } catch (e) {}
  }
  return '';
}

const TOPIC = (readTopicFromFile() || process.env.TOPIC || process.argv[2] || '').trim();

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
  process.exit(1);
}

function mkDebugDir() {
  const dir = path.join(process.cwd(), 'debug');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function fetchDouyinStats(douyin_id) {
  const url = `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${douyin_id}`;
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://www.douyin.com/',
      },
      timeout: 20000
    });
    const detail = res.data.aweme_detail;
    if (!detail || !detail.statistics) return null;
    return {
      play_count: detail.statistics.play_count,
      digg_count: detail.statistics.digg_count,
      comment_count: detail.statistics.comment_count,
      share_count: detail.statistics.share_count,
      create_time: detail.create_time
    };
  } catch (e) {
    console.warn('Fetch stats error for', douyin_id, e.message);
    return null;
  }
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

  // Track direct video URLs from network responses
  const directVideoUrls = new Map(); // douyin_id -> { url, meta }
  
  page.on('response', async (response) => {
    try {
      const url = response.url();
      const contentType = response.headers()['content-type'] || '';
      
      // Capture direct video URLs
      if (contentType.startsWith('video/') || url.includes('/play/') || url.includes('.mp4')) {
        console.log(`🎥 Found video response: ${url.substring(0, 80)}...`);
        
        // Try to extract douyin_id from URL or referer
        const douyinId = extractDouyinIdFromUrl(url) || extractDouyinIdFromUrl(response.request().url());
        if (douyinId) {
          directVideoUrls.set(douyinId, {
            url: url,
            meta: {
              content_type: contentType,
              content_length: response.headers()['content-length'],
              captured_at: new Date().toISOString(),
              source: 'network_response'
            }
          });
        }
      }

      // Capture video URLs from JSON responses
      if (contentType.includes('application/json') && (url.includes('/aweme/') || url.includes('/play/'))) {
        try {
          const json = await response.json();
          const extractedUrls = extractVideoUrlsFromJson(json);
          for (const { douyinId, videoUrl } of extractedUrls) {
            if (douyinId && videoUrl) {
              directVideoUrls.set(douyinId, {
                url: videoUrl,
                meta: {
                  source: 'json_response',
                  original_endpoint: url,
                  captured_at: new Date().toISOString()
                }
              });
            }
          }
        } catch (e) {
          // JSON parse failed, ignore
        }
      }
    } catch (e) {
      // Response processing failed, ignore
    }
  });

  if (TOPIC) console.log('=> Navigating to Douyin topic/search page for:', TOPIC);
  else console.log('=> Navigating to Douyin hot page...');

  // Build candidate URLs. If TOPIC provided, try topic/tag and search pages first, then fall back.
  const urlCandidates = TOPIC
    ? [
        // tag page (if topic is a tag slug)
        `https://www.douyin.com/tag/${encodeURIComponent(TOPIC)}`,
        // search page (works for free-text queries)
        `https://www.douyin.com/search/${encodeURIComponent(TOPIC)}`,
        // discover fallback
        'https://www.douyin.com/discover',
        'https://www.douyin.com/hot'
      ]
    : ['https://www.douyin.com/hot', 'https://www.douyin.com/discover'];
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
        // Add direct video URLs if captured
        items.forEach(item => {
          const directData = directVideoUrls.get(item.douyin_id);
          if (directData) {
            item.video_url_direct = directData.url;
            item.video_url_meta = directData.meta;
            console.log(`🎯 Mapped direct URL for ${item.douyin_id}`);
          }
        });
        
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
        items = Array.from(ids).slice(0, limit).map(id => {
          const item = {
            douyin_id: id,
            title: `Douyin ${id}`,
            video_url: `https://www.douyin.com/video/${id}`,
            thumbnail_url: null
          };
          
          // Add direct video URL if captured
          const directData = directVideoUrls.get(id);
          if (directData) {
            item.video_url_direct = directData.url;
            item.video_url_meta = directData.meta;
            console.log(`🎯 Mapped direct URL for ${id}`);
          }
          
          return item;
        });
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
          items = Array.from(ids2).slice(0, limit).map(id => {
            const item = {
              douyin_id: id,
              title: `Douyin ${id}`,
              video_url: `https://www.douyin.com/video/${id}`,
              thumbnail_url: null
            };
            
            // Add direct video URL if captured
            const directData = directVideoUrls.get(id);
            if (directData) {
              item.video_url_direct = directData.url;
              item.video_url_meta = directData.meta;
              console.log(`🎯 Mapped direct URL for ${id}`);
            }
            
            return item;
          });
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

// Helper function to extract douyin_id from URL
function extractDouyinIdFromUrl(url) {
  if (!url) return null;
  const match = url.match(/\/video\/([0-9A-Za-z_-]{6,})/);
  return match ? match[1] : null;
}

// Helper function to extract video URLs from JSON
function extractVideoUrlsFromJson(json) {
  const results = [];
  
  const traverse = (obj, path = '') => {
    if (!obj || typeof obj !== 'object') return;
    
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'aweme_id' || key === 'video_id') {
        // Found a video ID, look for associated video URL in the same object
        const videoUrl = findVideoUrlInObject(obj);
        if (videoUrl) {
          results.push({ douyinId: value, videoUrl });
        }
      } else if (typeof value === 'object') {
        traverse(value, `${path}.${key}`);
      }
    }
  };
  
  const findVideoUrlInObject = (obj) => {
    // Common paths where video URLs are found
    const paths = [
      'video.play_addr.url_list.0',
      'video.play_addr.url',
      'play_addr.url_list.0', 
      'play_url',
      'video_url'
    ];
    
    for (const path of paths) {
      const url = getNestedValue(obj, path);
      if (url && typeof url === 'string' && url.startsWith('http')) {
        return url;
      }
    }
    return null;
  };
  
  const getNestedValue = (obj, path) => {
    return path.split('.').reduce((curr, key) => curr && curr[key], obj);
  };
  
  traverse(json);
  return results;
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
    const upsertedVideos = res.data || [];
    
    // Update viral metrics for each video using the new function
    if (upsertedVideos.length > 0) {
      console.log('Updating viral metrics for', upsertedVideos.length, 'videos...');
      
      for (const video of upsertedVideos) {
        if (video.id && video.viral_score !== null && video.viral_score !== undefined) {
          try {
            await updateViralMetrics(video.id, video.viral_score);
          } catch (metricsError) {
            console.warn('Failed to update viral metrics for video', video.id, ':', metricsError.message);
          }
        }
      }
    }

    if (DEBUG) {
      const dir = mkDebugDir();
      const fname = path.join(dir, `upsert-response-${Date.now()}.json`);
      fs.writeFileSync(fname, JSON.stringify(res.data, null, 2), 'utf8');
      console.log('--> saved upsert response to', fname);
    }
    return { inserted: Array.isArray(res.data) ? res.data.length : 0, data: res.data };
  } catch (err) {
    console.error('Upsert error:', err.response ? err.response.data : err.message);
    throw err;
  }
}

async function updateViralMetrics(videoId, newScore) {
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/update_viral_metrics`;
  try {
    await axios.post(url, {
      p_video_id: videoId,
      p_new_score: newScore
    }, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
  } catch (err) {
    console.warn('Update viral metrics error:', err.response ? err.response.data : err.message);
    // Don't throw - this is not critical to the main flow
  }
}

(async () => {
  try {
    console.log('=== Douyin scraper started ===');
    const videos = await scrapeDouyin(LIMIT);
    console.log('Scraped videos count:', videos.length);
    // Tối ưu: lấy stats cho tất cả video trending song song
    if (videos && videos.length) {
      console.log('Fetching stats for videos...');
      const statsArr = await Promise.all(videos.map(v => fetchDouyinStats(v.douyin_id)));
      videos.forEach((v, i) => v.stats = statsArr[i]);

      // Tính trung bình các chỉ số
      const validStats = videos.map(v => v.stats).filter(s => s && s.play_count && s.digg_count && s.comment_count && s.share_count);
      const avg = {
        play_count: validStats.reduce((a, s) => a + s.play_count, 0) / validStats.length || 1,
        digg_count: validStats.reduce((a, s) => a + s.digg_count, 0) / validStats.length || 1,
        comment_count: validStats.reduce((a, s) => a + s.comment_count, 0) / validStats.length || 1,
        share_count: validStats.reduce((a, s) => a + s.share_count, 0) / validStats.length || 1,
      };

      // Hàm tính điểm viral cho từng video
      function calcViralScore(stats, created_at) {
        if (!stats) return 0;
        // Số ngày tồn tại
        const now = Date.now() / 1000;
        const days = Math.max(1, (now - (stats.create_time || (created_at ? Date.parse(created_at)/1000 : now))) / 86400);
        // Tốc độ tăng trưởng
        const growthViews = stats.play_count / days;
        const growthLikes = stats.digg_count / days;
        const growthComments = stats.comment_count / days;
        const growthShares = stats.share_count / days;
        // So sánh với trung bình
        const score =
          (growthViews / avg.play_count) +
          (growthLikes / avg.digg_count) +
          (growthComments / avg.comment_count) +
          (growthShares / avg.share_count);
        return Math.round(score * 100) / 100; // làm tròn 2 số
      }

      videos.forEach(v => {
        v.viral_score = calcViralScore(v.stats, v.created_at);
      });
    }
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
