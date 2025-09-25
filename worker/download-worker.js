// worker/download-worker.js
// Worker để claim download jobs và download video từ Douyin
// Load environment variables early (support running from any CWD)
const fs = require('fs');
const path = require('path');
try {
  const rootEnvPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(rootEnvPath)) {
    require('dotenv').config({ path: rootEnvPath });
  } else {
    require('dotenv').config();
  }
} catch (e) {
  // ignore dotenv errors; we'll validate vars below
}

const os = require('os');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { chromium } = require('playwright');
const axios = require('axios');

// Environment
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WORKER_ID = process.env.WORKER_ID || `worker-${os.hostname()}-${process.pid}`;
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '10000', 10); // 10s
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT || '2', 10);
const DEBUG = (process.env.DEBUG || 'true').toLowerCase() === 'true';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  console.error('➡️  Hãy tạo file .env ở project root với nội dung ví dụ:');
  console.error('SUPABASE_URL=https://xxxx.supabase.co');
  console.error('SUPABASE_SERVICE_ROLE_KEY=your_service_role_key');
  console.error('Đường dẫn .env đã cố gắng load:', path.join(__dirname, '..', '.env'));
  process.exit(1);
}

// Initialize Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

class DownloadWorker {
  constructor() {
    this.isRunning = false;
    this.activeJobs = new Map(); // jobId -> { job, controller }
    this.tempDir = path.join(os.tmpdir(), 'douyin-downloads');
    this.ensureTempDir();
  }

  ensureTempDir() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  async start() {
    console.log(`🚀 Download worker started (ID: ${WORKER_ID})`);
    console.log(`📁 Temp directory: ${this.tempDir}`);
    console.log(`⚙️  Max concurrent: ${MAX_CONCURRENT}, Poll interval: ${POLL_INTERVAL}ms`);
    
    this.isRunning = true;

    // Cleanup any stale jobs from previous runs
    await this.cleanupStaleJobs();

    // Main processing loop
    while (this.isRunning) {
      try {
        if (this.activeJobs.size < MAX_CONCURRENT) {
          const job = await this.claimJob();
          if (job) {
            this.processJob(job); // Start async processing
          }
        }
        await this.sleep(POLL_INTERVAL);
      } catch (error) {
        console.error('❌ Worker loop error:', error);
        await this.sleep(POLL_INTERVAL * 2); // Back off on error
      }
    }
  }

  async stop() {
    console.log('🛑 Stopping worker...');
    this.isRunning = false;
    
    // Cancel active jobs
    for (const [jobId, { controller }] of this.activeJobs) {
      console.log(`⏹️  Cancelling job ${jobId}`);
      controller.abort();
    }
    
    // Wait for cleanup
    await this.sleep(2000);
    console.log('✅ Worker stopped');
  }

  async claimJob() {
    try {
      // Atomic job claiming using FOR UPDATE SKIP LOCKED
      const { data, error } = await supabase.rpc('claim_download_job', {
        p_worker_id: WORKER_ID
      });

      if (error) {
        console.warn('⚠️  Claim job error:', error.message);
        return null;
      }

      if (data && data.length > 0) {
        const job = data[0];
        console.log(`📥 Claimed job ${job.id} for video ${job.video_id}`);
        return job;
      }

      return null;
    } catch (error) {
      console.error('❌ Claim job error:', error);
      return null;
    }
  }

  async processJob(job) {
    const controller = new AbortController();
    this.activeJobs.set(job.id, { job, controller });

    try {
      console.log(`🔄 Processing job ${job.id}...`);
      
      // Get video info
      const { data: video, error: videoError } = await supabase
        .from('videos')
        .select('*')
        .eq('id', job.video_id)
        .single();

      if (videoError || !video) {
        throw new Error(`Video not found: ${job.video_id}`);
      }

      // Update status to downloading
      await this.updateJobStatus(job.id, 'running', 'Starting download...');
      await this.updateVideoStatus(job.video_id, 'downloading');

      // Get direct video URL (either from video.video_url_direct or by extracting from page)
      let directUrl = video.video_url_direct;
      let videoMeta = video.video_url_meta || {};

      if (!directUrl) {
        console.log(`🔍 Extracting direct URL for ${video.douyin_id}...`);
        const extracted = await this.extractDirectUrl(video, controller.signal);
        directUrl = extracted.url;
        videoMeta = extracted.meta;
        
        // Save extracted URL back to video
        await supabase
          .from('videos')
          .update({
            video_url_direct: directUrl,
            video_url_meta: videoMeta
          })
          .eq('id', job.video_id);
      }

      if (!directUrl) {
        throw new Error('Could not extract direct video URL');
      }

      // Download the video file
      console.log(`⬇️  Downloading video from ${directUrl.substring(0, 50)}...`);
      const tempFile = await this.downloadFile(directUrl, videoMeta, controller.signal);

      // Validate file
      const fileStats = fs.statSync(tempFile);
      console.log(`📁 Downloaded ${fileStats.size} bytes to ${tempFile}`);

      if (fileStats.size < 1000) {
        throw new Error('Downloaded file too small (likely not a video)');
      }

      // Upload to Supabase Storage
      console.log(`☁️  Uploading to storage...`);
      const storageResult = await this.uploadToStorage(tempFile, video, controller.signal);

      // Update video record with storage info
      await supabase
        .from('videos')
        .update({
          status: 'uploaded',
          storage_provider: 'supabase',
          bucket: storageResult.bucket,
          object_key: storageResult.path,
          storage_etag: storageResult.etag,
          filesize: fileStats.size,
          mime_type: this.detectMimeType(tempFile),
          downloaded_at: new Date().toISOString(),
          storage_metadata: {
            original_url: directUrl,
            worker_id: WORKER_ID,
            downloaded_at: new Date().toISOString()
          }
        })
        .eq('id', job.video_id);

      // Mark job as completed
      await this.updateJobStatus(job.id, 'completed', 'Download completed successfully');

      console.log(`✅ Job ${job.id} completed successfully`);

      // Cleanup temp file
      fs.unlinkSync(tempFile);

    } catch (error) {
      console.error(`❌ Job ${job.id} failed:`, error.message);
      
      // Update job and video status
      await this.updateJobStatus(job.id, 'failed', error.message);
      await this.updateVideoStatus(job.video_id, 'failed', error.message);

    } finally {
      this.activeJobs.delete(job.id);
    }
  }

  async extractDirectUrl(video, signal) {
    // Use Playwright to visit video page and extract direct video URL
    const browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    });

    try {
      const page = await browser.newPage({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
      });

      let directUrl = null;
      let videoMeta = {};

      // Listen for video responses
      page.on('response', async (response) => {
        try {
          const url = response.url();
          const contentType = response.headers()['content-type'] || '';
          
          // Check for video content
          if (contentType.startsWith('video/') || url.includes('/play/') || url.includes('.mp4')) {
            console.log(`🎥 Found video response: ${url.substring(0, 100)}...`);
            directUrl = url;
            videoMeta = {
              content_type: contentType,
              content_length: response.headers()['content-length'],
              headers: response.headers()
            };
          }

          // Check for JSON responses with video URLs
          if (contentType.includes('application/json') && (url.includes('/aweme/') || url.includes('/play/'))) {
            try {
              const json = await response.json();
              const foundUrl = this.extractUrlFromJson(json);
              if (foundUrl) {
                console.log(`📱 Found video URL in JSON: ${foundUrl.substring(0, 100)}...`);
                directUrl = foundUrl;
                videoMeta = { source: 'json', original_response: url };
              }
            } catch (e) {
              // JSON parse failed, ignore
            }
          }
        } catch (e) {
          // Response handling failed, ignore
        }
      });

      // Navigate to video page
      const videoUrl = video.video_url || `https://www.douyin.com/video/${video.douyin_id}`;
      await page.goto(videoUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Wait for potential video loading
      await page.waitForTimeout(5000);

      // Try clicking play button if exists
      try {
        const playButton = page.locator('[data-e2e="video-play-btn"], .video-play-btn, button[aria-label*="play"]').first();
        if (await playButton.isVisible()) {
          await playButton.click();
          await page.waitForTimeout(3000);
        }
      } catch (e) {
        // Play button not found or not clickable
      }

      // If still no direct URL, try to find video element
      if (!directUrl) {
        const videoSrc = await page.locator('video').first().getAttribute('src');
        if (videoSrc && videoSrc.startsWith('http')) {
          directUrl = videoSrc;
          videoMeta = { source: 'video_element' };
        }
      }

      return { url: directUrl, meta: videoMeta };

    } finally {
      await browser.close();
    }
  }

  extractUrlFromJson(json) {
    // Try to find video URL in JSON response
    const traverse = (obj) => {
      if (!obj || typeof obj !== 'object') return null;
      
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string' && value.startsWith('http') && (value.includes('.mp4') || value.includes('/play/'))) {
          return value;
        }
        if (typeof value === 'object') {
          const found = traverse(value);
          if (found) return found;
        }
      }
      return null;
    };

    return traverse(json);
  }

  async downloadFile(url, meta, signal) {
    const tempFile = path.join(this.tempDir, `download-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.tmp`);
    
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.douyin.com/',
        ...(meta.headers || {})
      },
      timeout: 120000, // 2 minutes
      signal
    });

    const writer = fs.createWriteStream(tempFile);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(tempFile));
      writer.on('error', reject);
      signal.addEventListener('abort', () => {
        writer.destroy();
        reject(new Error('Download aborted'));
      });
    });
  }

  async uploadToStorage(filePath, video, signal) {
    const fileName = `${video.douyin_id}_${Date.now()}.mp4`;
    const storagePath = `videos/${video.douyin_id}/${fileName}`;
    
    const fileBuffer = fs.readFileSync(filePath);
    
    const { data, error } = await supabase.storage
      .from('videos')
      .upload(storagePath, fileBuffer, {
        contentType: 'video/mp4',
        cacheControl: '3600'
      });

    if (error) {
      throw new Error(`Storage upload failed: ${error.message}`);
    }

    return {
      bucket: 'videos',
      path: storagePath,
      etag: data.etag || null
    };
  }

  detectMimeType(filePath) {
    // Simple MIME type detection based on file content
    const buffer = fs.readFileSync(filePath, { start: 0, end: 12 });
    
    if (buffer.includes(Buffer.from('ftyp'))) return 'video/mp4';
    if (buffer.includes(Buffer.from('WEBM'))) return 'video/webm';
    
    return 'video/mp4'; // Default fallback
  }

  async updateJobStatus(jobId, status, message = null) {
    await supabase
      .from('download_jobs')
      .update({
        status,
        last_error: status === 'failed' ? message : null,
        finished_at: ['completed', 'failed'].includes(status) ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);
  }

  async updateVideoStatus(videoId, status, error = null) {
    const updates = {
      status,
      updated_at: new Date().toISOString()
    };

    if (error) {
      updates.last_error = error;
      updates.attempts = supabase.raw('COALESCE(attempts, 0) + 1');
      updates.last_attempt_at = new Date().toISOString();
    }

    await supabase
      .from('videos')
      .update(updates)
      .eq('id', videoId);
  }

  async cleanupStaleJobs() {
    // Reset any jobs that were marked as running by this worker (in case of crash)
    const { error } = await supabase
      .from('download_jobs')
      .update({
        status: 'pending',
        worker_id: null,
        started_at: null
      })
      .eq('worker_id', WORKER_ID)
      .eq('status', 'running');

    if (error) {
      console.warn('⚠️  Failed to cleanup stale jobs:', error.message);
    } else {
      console.log('🧹 Cleaned up stale jobs');
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Handle graceful shutdown
const worker = new DownloadWorker();

process.on('SIGINT', async () => {
  console.log('\n📯 Received SIGINT, shutting down gracefully...');
  await worker.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n📯 Received SIGTERM, shutting down gracefully...');
  await worker.stop();
  process.exit(0);
});

// Start the worker
worker.start().catch((error) => {
  console.error('💥 Worker crashed:', error);
  process.exit(1);
});