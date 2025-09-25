require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3001;

// Environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Middleware
app.use(cors());
app.use(express.json());

// Root info route (avoid 'Cannot GET /')
app.get('/', async (req, res) => {
  try {
    // Try count videos & queued jobs (non-fatal if fails)
    const [{ data: videoCountData }, { data: jobCountData }] = await Promise.all([
      supabase.from('videos').select('id', { count: 'exact', head: true }),
      supabase.from('download_jobs').select('id', { count: 'exact', head: true })
    ]).catch(() => [{ data: null }, { data: null }]);

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Douyin Download API</title>
<style>body{font-family:system-ui,Arial,sans-serif;margin:40px;line-height:1.4;color:#222}code{background:#f5f5f5;padding:2px 5px;border-radius:4px}h1{margin-top:0}table{border-collapse:collapse;margin-top:12px}td,th{padding:4px 10px;border:1px solid #ddd;font-size:14px}a{color:#0b61d6;text-decoration:none}a:hover{text-decoration:underline}.pill{display:inline-block;padding:2px 8px;border-radius:12px;background:#eee;font-size:12px;margin-left:6px}</style></head><body>
<h1>Douyin Download API</h1>
<p>✅ Service is running. Use the endpoints below.</p>
<h2>Quick Endpoints</h2>
<ul>
  <li><code>GET /health</code> – health status</li>
  <li><code>GET /api/videos/:id/download</code> – check/obtain download</li>
  <li><code>POST /api/videos/:id/download</code> – queue download (if your UI/flow supports POST trigger)</li>
  <li><code>POST /api/videos/:id/retry</code> – retry failed download</li>
</ul>
<h2>Stats</h2>
<table><tr><th>Metric</th><th>Value</th></tr>
<tr><td>Total videos (approx)</td><td>${videoCountData?.length !== undefined ? videoCountData.length : '—'}</td></tr>
<tr><td>Download jobs (approx)</td><td>${jobCountData?.length !== undefined ? jobCountData.length : '—'}</td></tr>
<tr><td>Server time</td><td>${new Date().toISOString()}</td></tr>
</table>
<p style="margin-top:32px;font-size:12px;color:#666">Add more functionality by editing <code>api/download.js</code>.</p>
</body></html>`;
    res.status(200).send(html);
  } catch (e) {
    res.json({ status: 'ok', message: 'Root route', error: e.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Get video download status and URL
async function handleDownloadRequest(req, res) {
  try {
    const { id } = req.params;
    const { proxy } = req.query; // ?proxy=true

    // Relax ID validation: allow non-UUID (some IDs may be custom text)
    if (!id || id.length < 3) {
      return res.status(400).json({ error: 'Invalid video ID' });
    }

    const { data: video, error: dbError } = await supabase
      .from('videos')
      .select('*')
      .eq('id', id)
      .single();

    if (dbError || !video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    if (video.marked_for_deletion) {
      return res.status(410).json({ error: 'Video has been deleted' });
    }

    const status = video.status || 'new';

    if (['new','queued','pending'].includes(status)) {
      // Upsert job
      const { error: jobError } = await supabase
        .from('download_jobs')
        .upsert({
          video_id: id,
          status: 'pending',
          scheduled_at: new Date().toISOString()
        }, {
          onConflict: 'video_id',
          ignoreDuplicates: true
        });
      if (jobError) console.warn('Failed to create download job:', jobError.message);
      return res.status(202).json({ status: 'queued', message: 'Download queued' });
    }

    if (status === 'downloading' || status === 'running') {
      return res.status(202).json({ status: 'downloading', message: 'Download in progress', progress: video.download_progress || null });
    }

    if (['uploaded','processed','ready'].includes(status)) {
      if (!video.object_key || !video.bucket) {
        return res.status(500).json({ error: 'Storage metadata missing despite status' });
      }
      if (proxy === 'true') {
        return await proxyVideoFile(res, video);
      } else {
        return await getSignedUrl(res, video);
      }
    }

    if (status === 'failed') {
      return res.status(500).json({ status: 'failed', error: video.last_error || 'Download failed', retry_available: (video.attempts || 0) < 3 });
    }

    return res.status(500).json({ error: 'Unknown video status', status });
  } catch (error) {
    console.error('Download API error:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}

// GET + POST both supported for flexibility
app.get('/api/videos/:id/download', handleDownloadRequest);
app.post('/api/videos/:id/download', handleDownloadRequest);

// Helper: Generate signed URL from Supabase Storage
async function getSignedUrl(res, video) {
  try {
    const { data, error } = await supabase.storage
      .from(video.bucket)
      .createSignedUrl(video.object_key, 3600); // 1 hour expiry

    if (error) {
      console.error('Signed URL error:', error);
      return res.status(500).json({ error: 'Failed to generate download URL' });
    }

    res.json({
      status: 'ready',
      download_url: data.signedUrl,
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      filename: getFilename(video),
      filesize: video.filesize,
      mime_type: video.mime_type
    });

  } catch (error) {
    console.error('Get signed URL error:', error);
    res.status(500).json({ error: 'Failed to generate signed URL' });
  }
}

// Helper: Proxy file through our server
async function proxyVideoFile(res, video) {
  try {
    // Get signed URL first
    const { data, error } = await supabase.storage
      .from(video.bucket)
      .createSignedUrl(video.object_key, 300); // 5 min for proxy

    if (error) {
      return res.status(500).json({ error: 'Failed to access video file' });
    }

    // Stream the file
    const response = await axios({
      method: 'GET',
      url: data.signedUrl,
      responseType: 'stream',
      timeout: 30000
    });

    // Set appropriate headers
    res.set({
      'Content-Type': video.mime_type || 'video/mp4',
      'Content-Length': video.filesize || undefined,
      'Content-Disposition': `attachment; filename="${getFilename(video)}"`,
      'Cache-Control': 'private, max-age=3600'
    });

    // Pipe the stream
    response.data.pipe(res);

  } catch (error) {
    console.error('Proxy file error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to proxy video file' });
    }
  }
}

// Helper: Generate filename
function getFilename(video) {
  const sanitized = (video.title || video.douyin_id || 'video')
    .replace(/[^a-zA-Z0-9\-_\s]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 100);
  
  const ext = video.mime_type === 'video/mp4' ? '.mp4' : 
              video.mime_type === 'video/webm' ? '.webm' : '.mp4';
  
  return `${sanitized}_${video.douyin_id}${ext}`;
}

// Retry failed download
app.post('/api/videos/:id/retry', async (req, res) => {
  try {
    const { id } = req.params;

    // Check video exists and is failed
    const { data: video, error } = await supabase
      .from('videos')
      .select('status, attempts')
      .eq('id', id)
      .single();

    if (error || !video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    if (video.status !== 'failed') {
      return res.status(400).json({ error: 'Video is not in failed state' });
    }

    if (video.attempts >= 3) {
      return res.status(400).json({ error: 'Maximum retry attempts exceeded' });
    }

    // Create new download job
    const { error: jobError } = await supabase
      .from('download_jobs')
      .insert({
        video_id: id,
        status: 'pending',
        scheduled_at: new Date().toISOString(),
        payload: { retry: true }
      });

    if (jobError) {
      return res.status(500).json({ error: 'Failed to schedule retry' });
    }

    // Update video status
    await supabase
      .from('videos')
      .update({ 
        status: 'queued',
        last_error: null 
      })
      .eq('id', id);

    res.json({ 
      status: 'queued',
      message: 'Retry scheduled successfully' 
    });

  } catch (error) {
    console.error('Retry API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`Download API server running on http://${HOST}:${PORT}`);
  console.log(`Health (inside container): http://localhost:${PORT}/health`);
  console.log(`If accessing from another machine use: http://<server-ip>:${PORT}/`);
  console.log(`Download endpoint: http://<server-ip>:${PORT}/api/videos/:id/download`);
});

module.exports = app;