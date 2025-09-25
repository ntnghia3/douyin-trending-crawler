"use client";
import { supabase } from '../src/utils/supabaseClient';
import { useEffect, useState } from 'react';

type DouyinVideo = {
  id: string;
  douyin_id: string;
  title: string;
  video_url: string;
  thumbnail_url: string;
  stats?: any;
  public_url?: string;
  storage_path?: string;
  processed?: boolean;
  created_at?: string;
};

export default function Home() {
  const [videos, setVideos] = useState<DouyinVideo[]>([]);
  const [loading, setLoading] = useState(true);
  
  // State for download tracking
  const [downloadingVideos, setDownloadingVideos] = useState<Set<string>>(new Set());
  const [downloadProgress, setDownloadProgress] = useState<{[key: string]: string}>({});

  useEffect(() => {
    const fetchVideos = async () => {
      const { data, error } = await supabase.from('videos').select('*');
      console.log('Supabase response:', { data, error });
      if (!error && data) {
        setVideos(data);
      } else if (error) {
        console.error('Supabase error:', error);
      }
      setLoading(false);
    };
    fetchVideos();
  }, []);

  // Test function to add sample data
  const addTestVideo = async () => {
    const testVideo = {
      douyin_id: 'test_' + Date.now(),
      title: 'Test Video - ' + new Date().toLocaleString(),
      video_url: 'https://example.com/video.mp4',
      thumbnail_url: 'https://example.com/thumb.jpg',
      public_url: 'https://example.com/public.mp4',
      storage_path: '/test/video.mp4',
      processed: true,
      stats: { views: 1000, likes: 100, shares: 50 }
    };

    console.log('Adding test video:', testVideo);
    const { data, error } = await supabase.from('videos').insert(testVideo).select();
    console.log('Insert response:', { data, error });
    
    if (error) {
      alert('Lỗi RLS: ' + error.message + '\n\nVào Supabase Dashboard → Table Editor → videos → Settings → tắt "Enable Row Level Security"');
    } else if (data) {
      alert('Thêm thành công! Đang refresh...');
      // Refresh the videos list
      const { data: allVideos } = await supabase.from('videos').select('*');
      if (allVideos) setVideos(allVideos);
    }
  };

  // Download video function using our API
  const downloadVideo = async (video: DouyinVideo) => {
    try {
      // Check if already downloading
      if (downloadingVideos.has(video.id)) {
        alert('Video đang được download...');
        return;
      }

      // Add to downloading set
      setDownloadingVideos(prev => new Set(prev).add(video.id));
      setDownloadProgress(prev => ({ ...prev, [video.id]: 'Initializing...' }));

      const apiBase = process.env.NEXT_PUBLIC_DOWNLOAD_API_BASE || 'http://localhost:3001';
      // Call our download API
      const response = await fetch(`${apiBase}/api/videos/${video.id}/download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Download failed');
      }

      // Handle different response types
      const directUrl = result.downloadUrl || result.download_url; // support both camel & snake case
      if (result.status === 'ready' && directUrl) {
        // File is ready, start download
        setDownloadProgress(prev => ({ ...prev, [video.id]: 'Ready! Starting download...' }));
        const link = document.createElement('a');
        link.href = directUrl;
        link.download = result.filename || `douyin_${video.douyin_id}.mp4`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        setDownloadProgress(prev => ({ ...prev, [video.id]: 'Downloaded!' }));
        setTimeout(() => {
          setDownloadingVideos(prev => {
            const newSet = new Set(prev);
            newSet.delete(video.id);
            return newSet;
          });
          setDownloadProgress(prev => {
            const newProgress = { ...prev };
            delete newProgress[video.id];
            return newProgress;
          });
        }, 3000);
      } else if (result.status === 'queued' || result.status === 'downloading') {
        // Video is being processed
        setDownloadProgress(prev => ({ ...prev, [video.id]: 'Queued for download...' }));
        
        // Start polling for status
        pollDownloadStatus(video.id);
      } else {
        throw new Error('Unexpected response status: ' + result.status);
      }

    } catch (error) {
      console.error('Download error:', error);
      alert('Lỗi khi download video: ' + error);
      
      // Remove from downloading set
      setDownloadingVideos(prev => {
        const newSet = new Set(prev);
        newSet.delete(video.id);
        return newSet;
      });
      setDownloadProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[video.id];
        return newProgress;
      });
    }
  };

  // Poll download status
  const pollDownloadStatus = async (videoId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const apiBase = process.env.NEXT_PUBLIC_DOWNLOAD_API_BASE || 'http://localhost:3001';
        const response = await fetch(`${apiBase}/api/videos/${videoId}/download`);
        const result = await response.json();

        const directUrl = result.downloadUrl || result.download_url;
        if (result.status === 'ready' && directUrl) {
          // Download is ready
          clearInterval(pollInterval);
          setDownloadProgress(prev => ({ ...prev, [videoId]: 'Ready! Click to download...' }));
          
          // Auto-start download
          const link = document.createElement('a');
          link.href = directUrl;
          link.download = result.filename || `douyin_${videoId}.mp4`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          setDownloadProgress(prev => ({ ...prev, [videoId]: 'Downloaded!' }));
          setTimeout(() => {
            setDownloadingVideos(prev => {
              const newSet = new Set(prev);
              newSet.delete(videoId);
              return newSet;
            });
            setDownloadProgress(prev => {
              const newProgress = { ...prev };
              delete newProgress[videoId];
              return newProgress;
            });
          }, 3000);
        } else if (result.status === 'downloading') {
          setDownloadProgress(prev => ({ ...prev, [videoId]: 'Downloading from Douyin...' }));
        } else if (result.status === 'error') {
          clearInterval(pollInterval);
          setDownloadProgress(prev => ({ ...prev, [videoId]: 'Error: ' + (result.error || 'Download failed') }));
          setTimeout(() => {
            setDownloadingVideos(prev => {
              const newSet = new Set(prev);
              newSet.delete(videoId);
              return newSet;
            });
            setDownloadProgress(prev => {
              const newProgress = { ...prev };
              delete newProgress[videoId];
              return newProgress;
            });
          }, 5000);
        }
      } catch (error) {
        console.error('Polling error:', error);
        clearInterval(pollInterval);
        setDownloadProgress(prev => ({ ...prev, [videoId]: 'Polling error' }));
      }
    }, 2000); // Poll every 2 seconds

    // Cleanup after 5 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
    }, 5 * 60 * 1000);
  };

  // Test database connection
  const testConnection = async () => {
    try {
      // Test basic connection
      const { data, error } = await supabase.from('videos').select('count', { count: 'exact' });
      console.log('Connection test:', { data, error });
      
      if (error) {
        alert('Lỗi kết nối: ' + error.message);
      } else {
        alert('Kết nối thành công! Database có ' + (data?.length || 0) + ' records');
      }
    } catch (err) {
      console.error('Connection error:', err);
      alert('Lỗi: ' + err);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold mb-6">Douyin Viral Videos</h1>
      
      {/* Test buttons */}
      <div className="mb-4 space-x-2">
        <button 
          onClick={testConnection}
          className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
        >
          Test Connection
        </button>
        <button 
          onClick={addTestVideo}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Add Test Video
        </button>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl">
          {videos.map((video) => (
            <div key={video.id} className="border rounded-lg p-4 flex flex-col items-center bg-white shadow-lg">
              <img 
                src={video.thumbnail_url} 
                alt={video.title} 
                className="w-full h-48 object-cover mb-2 rounded" 
                onError={(e) => {
                  e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtc2l6ZT0iMTgiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5ObyBJbWFnZTwvdGV4dD48L3N2Zz4=';
                }}
              />
              <h2 className="text-lg font-semibold mb-2 text-center line-clamp-2">{video.title}</h2>
              
              {/* Video stats */}
              {video.stats && (
                <div className="text-sm text-gray-600 mb-2 text-center">
                  {typeof video.stats === 'object' && (
                    <>
                      {video.stats.views && <span>👁️ {video.stats.views.toLocaleString()} </span>}
                      {video.stats.likes && <span>❤️ {video.stats.likes.toLocaleString()} </span>}
                      {video.stats.shares && <span>🔄 {video.stats.shares.toLocaleString()}</span>}
                    </>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex space-x-2 mt-auto">
                <a 
                  href={video.video_url} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="bg-blue-500 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm"
                >
                  🎬 Watch
                </a>
                <button
                  onClick={() => downloadVideo(video)}
                  disabled={downloadingVideos.has(video.id)}
                  className={`px-4 py-2 rounded text-sm ${
                    downloadingVideos.has(video.id) 
                      ? 'bg-gray-400 cursor-not-allowed' 
                      : 'bg-green-500 hover:bg-green-700'
                  } text-white`}
                >
                  {downloadingVideos.has(video.id) ? '⏳ Processing...' : '⬇️ Download'}
                </button>
              </div>

              {/* Download progress */}
              {downloadProgress[video.id] && (
                <div className="text-xs text-blue-600 mt-2 text-center font-medium">
                  {downloadProgress[video.id]}
                </div>
              )}

              {/* Additional info */}
              <div className="text-xs text-gray-500 mt-2 text-center">
                {video.created_at && (
                  <div>Added: {new Date(video.created_at).toLocaleDateString()}</div>
                )}
                {video.douyin_id && (
                  <div>ID: {video.douyin_id}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

/* Supabase Row Level Security Policies */

/* -- Policy cho phép đọc dữ liệu
CREATE POLICY "Enable read access for all users" ON "public"."videos"
AS PERMISSIVE FOR SELECT
TO public
USING (true);

-- Policy cho phép insert dữ liệu (nếu cần)
CREATE POLICY "Enable insert access for all users" ON "public"."videos"
AS PERMISSIVE FOR INSERT
TO public
WITH CHECK (true); */
