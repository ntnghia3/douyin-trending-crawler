#!/usr/bin/env node
// List viral videos from Supabase with optional keyword (topic) and time window filters
// Usage examples:
//   node scripts/list-viral.js --q "室内设计" --since 24h --limit 30
//   node scripts/list-viral.js --since 2d
//   npm run list:viral -- --q "美食" --since 48h --limit 50

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[list-viral] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
  process.exit(1);
}

function readTopicFromFile() {
  const candidates = [
    path.join(process.cwd(), 'config', 'topic.txt'),
    path.join(process.cwd(), 'topic.txt'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const s = fs.readFileSync(p, 'utf8').trim();
        if (s) return s.split('\n')[0].trim();
      }
    } catch (_) {}
  }
  return '';
}

function parseArgs(argv) {
  const args = { limit: 20 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--limit' && next) { args.limit = parseInt(next, 10); i++; continue; }
    if (a === '--q' && next) { args.q = next; i++; continue; }
    if (a === '--since' && next) { args.since = next; i++; continue; }
    if (a === '--sort' && next) { args.sort = next; i++; continue; }
    if (a === '--all') { args.all = true; continue; }
    if (a === '--json') { args.json = true; continue; }
    if (a === '-h' || a === '--help') { args.help = true; }
  }
  return args;
}

function parseSince(str) {
  // Accept ISO timestamp or relative like 24h, 7d, 60m
  if (!str) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) return new Date(str);
  const m = str.match(/^(\d+)([mhd])$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const now = new Date();
  if (unit === 'm') return new Date(now.getTime() - n * 60 * 1000);
  if (unit === 'h') return new Date(now.getTime() - n * 60 * 60 * 1000);
  if (unit === 'd') return new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
  return null;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`List viral videos
Options:
  --q <keyword>     Filter title by keyword (defaults to topic in config/topic.txt if present)
  --since <window>  Time window, e.g. 12h, 2d, 90m, or ISO timestamp
  --limit <n>       Max rows (default 20)
  --all             Ignore topic and return all videos
  --sort <field>    Order by: score (default), momentum, created
  --json            Output raw JSON instead of table

Examples:
  node scripts/list-viral.js --q "室内设计" --since 24h --limit 30
  node scripts/list-viral.js --since 2d
  npm run list:viral -- --q "美食" --since 48h --limit 50
`);
    process.exit(0);
  }

  // Default q from topic file if not provided
  if (!args.q && !args.all) {
    const t = readTopicFromFile();
    if (t) args.q = t;
  }

  // Build query params for PostgREST
  const params = new URLSearchParams();
  params.set('select', [
    'id', 'douyin_id', 'title', 'viral_score', 'viral_momentum', 'surge_detected',
    'created_at', 'video_url', 'thumbnail_url'
  ].join(','));
  // Sorting
  const sort = (args.sort || 'score').toLowerCase();
  let order;
  if (sort === 'momentum') {
    order = 'surge_detected.desc,viral_momentum.desc.nullslast,viral_score.desc.nullslast,created_at.desc';
  } else if (sort === 'created') {
    order = 'created_at.desc';
  } else { // score (default)
    order = 'surge_detected.desc,viral_score.desc.nullslast,viral_momentum.desc.nullslast,created_at.desc';
  }
  params.set('order', order);
  params.set('limit', String(args.limit || 20));

  // created_at >= since
  const sinceDate = parseSince(args.since);
  if (sinceDate) {
    params.set('created_at', `gte.${sinceDate.toISOString()}`);
  }

  // title ilike *q*
  if (args.q && !args.all) {
    // PostgREST ilike wildcard uses *
    params.set('title', `ilike.*${args.q}*`);
  }

  const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/videos?${params.toString()}`;

  try {
    const res = await axios.get(url, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      timeout: 20000,
    });

    const rows = res.data || [];
    if (!rows.length) {
      console.log('[list-viral] No rows found. Try adjusting --since or --q.');
      return;
    }

    // Pretty print compact table
    const out = rows.map(r => ({
      id: r.id,
      douyin: r.douyin_id,
      score: r.viral_score,
      momentum: r.viral_momentum,
      surge: !!r.surge_detected,
      title: r.title?.slice(0, 60) || '',
      created_at: r.created_at,
      url: r.video_url,
    }));

    if (args.json) {
      console.log(JSON.stringify(rows, null, 2));
    } else {
      // Use console.table if available; fallback to JSON
      if (console.table) console.table(out);
      else console.log(JSON.stringify(out, null, 2));
    }

  } catch (err) {
    const msg = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error('[list-viral] Query error:', msg);
    process.exit(2);
  }
}

main();
