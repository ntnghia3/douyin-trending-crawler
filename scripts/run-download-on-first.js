#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const fetch = global.fetch || require('node-fetch');

const API_BASE = process.env.DOWNLOAD_API_BASE || 'http://localhost:3001';
const OUT_DIR = path.join(process.cwd(), 'downloads');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function pickVideo() {
  const { data, error } = await supabase
    .from('videos')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  if (!data || !data.length) {
    throw new Error('No videos found in database. Run crawler first.');
  }
  return data[0];
}

async function triggerDownload(video) {
  const res = await fetch(`${API_BASE}/api/videos/${video.id}/download`, { method: 'POST' });
  const json = await res.json();
  if (!res.ok) throw new Error(`Download trigger failed: ${json.error || res.status}`);
  return json;
}

async function poll(videoId, timeoutMs = 5 * 60 * 1000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${API_BASE}/api/videos/${videoId}/download`);
    const json = await res.json();
    process.stdout.write(`\rStatus: ${json.status}${json.error ? ' (' + json.error + ')' : ''}        `);
    if (json.status === 'ready' && json.downloadUrl) {
      console.log('\n✅ Download ready');
      return json;
    }
    if (json.status === 'error') {
      throw new Error(json.error || 'Download failed');
    }
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error('Timeout waiting for download to be ready');
}

async function saveFile(url, filename) {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch file: ${res.status}`);
  const filePath = path.join(OUT_DIR, filename);
  const fileStream = fs.createWriteStream(filePath);
  await new Promise((resolve, reject) => {
    res.body.pipe(fileStream);
    res.body.on('error', reject);
    fileStream.on('finish', resolve);
  });
  console.log(`🎉 Saved file: ${filePath}`);
  return filePath;
}

(async () => {
  try {
    console.log('🔎 Picking latest video from database...');
    const video = await pickVideo();
    console.log(`Selected video id=${video.id} douyin_id=${video.douyin_id || 'n/a'} title="${(video.title||'').slice(0,60)}"`);

    console.log('🚀 Triggering download job via API...');
    const trigger = await triggerDownload(video);
    console.log('Initial status:', trigger.status);

    console.log('⏳ Polling for completion...');
    const result = await poll(video.id);

    const filename = result.filename || `douyin_${video.douyin_id || video.id}.mp4`;
    console.log('⬇️ Downloading file from signed URL...');
    await saveFile(result.downloadUrl, filename);
    console.log('✅ Done');
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  }
})();
