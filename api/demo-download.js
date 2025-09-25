const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// In-memory storage for demo
let demoVideos = [
  {
    id: 'demo1',
    douyin_id: 'demo_123',
    title: 'Demo Video - Funny Dance',
    video_url: 'https://www.learningcontainer.com/wp-content/uploads/2020/05/sample-mp4-file.mp4',
    thumbnail_url: 'https://via.placeholder.com/300x200/ff6b6b/white?text=Demo+Video+1',
    stats: { views: 50000, likes: 1200, shares: 300 },
    download_status: 'pending'
  },
  {
    id: 'demo2', 
    douyin_id: 'demo_456',
    title: 'Demo Video - Cat Playing',
    video_url: 'https://www.learningcontainer.com/wp-content/uploads/2020/05/sample-mp4-file.mp4',
    thumbnail_url: 'https://via.placeholder.com/300x200/4ecdc4/white?text=Demo+Video+2',
    stats: { views: 25000, likes: 800, shares: 150 },
    download_status: 'pending'
  }
];

let downloadJobs = {};

// Get all videos (for UI)
app.get('/api/videos', (req, res) => {
  res.json(demoVideos);
});

// Download endpoint
app.post('/api/videos/:id/download', async (req, res) => {
  const { id } = req.params;
  const video = demoVideos.find(v => v.id === id);
  
  if (!video) {
    return res.status(404).json({ error: 'Video not found' });
  }

  // Create download job
  downloadJobs[id] = {
    status: 'downloading',
    startTime: Date.now()
  };

  // Update video status
  video.download_status = 'downloading';

  res.json({
    status: 'downloading',
    message: 'Download started'
  });

  // Simulate download process
  setTimeout(() => {
    downloadJobs[id] = {
      status: 'ready',
      downloadUrl: video.video_url,
      filename: `demo_${video.douyin_id}.mp4`
    };
    video.download_status = 'ready';
  }, 3000); // 3 seconds delay to simulate processing
});

// Check download status
app.get('/api/videos/:id/download', (req, res) => {
  const { id } = req.params;
  const job = downloadJobs[id];
  
  if (!job) {
    return res.json({ status: 'pending' });
  }

  res.json(job);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    mode: 'demo',
    message: 'Demo download API is running'
  });
});

app.listen(PORT, () => {
  console.log(`🎬 Demo Download API running on http://localhost:${PORT}`);
  console.log('📁 Files will download to your default Downloads folder');
  console.log('🔗 Demo videos use sample MP4 files for testing');
});

module.exports = app;