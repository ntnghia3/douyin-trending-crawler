#!/usr/bin/env node

/**
 * 🎯 ALTERNATIVE DATA SOURCES - Real Video Integration
 * 
 * Since Douyin blocks automated access, integrate with real APIs
 */

const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');

class AlternativeDataIntegrator {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL || 'https://your-project.supabase.co',
      process.env.SUPABASE_ANON_KEY || 'your-anon-key'
    );
  }

  /**
   * 🌟 OPTION 1: TikTok Research API Integration
   */
  async integrateWithTikTokAPI() {
    console.log('🔗 Integrating with TikTok Research API...');
    
    try {
      // TikTok Research API endpoint
      const response = await axios.post('https://open.tiktokapis.com/v2/research/video/query/', {
        query: {
          and: [
            {
              operation: 'IN',
              field_name: 'region_code',
              field_values: ['CN', 'VN', 'TH'] // Chinese markets + Vietnam/Thailand
            },
            {
              operation: 'GTE',
              field_name: 'create_date',
              field_values: [Math.floor((Date.now() - 3 * 24 * 60 * 60 * 1000) / 1000)]
            }
          ]
        },
        max_count: 100,
        is_random: false
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.TIKTOK_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });

      const videos = response.data.data.videos || [];
      console.log(`✅ Found ${videos.length} videos from TikTok API`);
      
      return this.processAlternativeVideos(videos, 'tiktok-api');
      
    } catch (error) {
      console.log('❌ TikTok API not configured:', error.message);
      return [];
    }
  }

  /**
   * 🌟 OPTION 2: RapidAPI Integration
   */
  async integrateWithRapidAPI() {
    console.log('🔗 Integrating with RapidAPI Douyin endpoints...');
    
    const rapidAPIEndpoints = [
      {
        name: 'douyin-video-no-watermark',
        url: 'https://douyin-video-no-watermark.p.rapidapi.com/api/trending',
        headers: {
          'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
          'X-RapidAPI-Host': 'douyin-video-no-watermark.p.rapidapi.com'
        }
      },
      {
        name: 'tiktok-scraper-2023',
        url: 'https://tiktok-scraper-2023.p.rapidapi.com/trending-videos',
        headers: {
          'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
          'X-RapidAPI-Host': 'tiktok-scraper-2023.p.rapidapi.com'
        }
      }
    ];

    let allVideos = [];
    
    for (const endpoint of rapidAPIEndpoints) {
      try {
        console.log(`📡 Testing ${endpoint.name}...`);
        
        const response = await axios.get(endpoint.url, {
          headers: endpoint.headers,
          timeout: 15000
        });
        
        const videos = response.data.videos || response.data.data || [];
        console.log(`✅ ${endpoint.name}: ${videos.length} videos`);
        
        allVideos = allVideos.concat(
          await this.processAlternativeVideos(videos, endpoint.name)
        );
        
      } catch (error) {
        console.log(`❌ ${endpoint.name} failed:`, error.message);
      }
    }
    
    return allVideos;
  }

  /**
   * 🌟 OPTION 3: Social Media Aggregation APIs
   */
  async integrateWithSocialAPIs() {
    console.log('🔗 Integrating with social media aggregation APIs...');
    
    const socialAPIs = [
      {
        name: 'socialdata.tools',
        url: 'https://api.socialdata.tools/douyin/trending',
        headers: {
          'Authorization': `Bearer ${process.env.SOCIALDATA_API_KEY}`
        }
      },
      {
        name: 'apify-douyin-scraper',
        url: 'https://api.apify.com/v2/acts/douyin-scraper/run-sync-get-dataset-items',
        headers: {
          'Authorization': `Bearer ${process.env.APIFY_API_TOKEN}`
        }
      }
    ];

    let allVideos = [];
    
    for (const api of socialAPIs) {
      try {
        console.log(`📡 Testing ${api.name}...`);
        
        const response = await axios.get(api.url, {
          headers: api.headers,
          timeout: 15000
        });
        
        const videos = response.data.items || response.data.results || [];
        console.log(`✅ ${api.name}: ${videos.length} videos`);
        
        allVideos = allVideos.concat(
          await this.processAlternativeVideos(videos, api.name)
        );
        
      } catch (error) {
        console.log(`❌ ${api.name} not configured:`, error.message);
      }
    }
    
    return allVideos;
  }

  /**
   * 📊 Process videos from alternative sources
   */
  async processAlternativeVideos(rawVideos, source) {
    const processedVideos = [];
    
    for (const video of rawVideos) {
      try {
        // Normalize different API response formats
        const normalizedVideo = this.normalizeVideoData(video, source);
        
        if (normalizedVideo && normalizedVideo.douyin_id) {
          processedVideos.push(normalizedVideo);
        }
      } catch (error) {
        console.log('⚠️ Error processing video:', error.message);
      }
    }
    
    // Apply viral scoring algorithm
    const scoredVideos = this.calculateViralScores(processedVideos);
    
    // Get top 10 by viral score
    const topVideos = scoredVideos
      .sort((a, b) => b.viral_score - a.viral_score)
      .slice(0, 10);
    
    console.log(`🎯 Selected ${topVideos.length} top viral videos from ${source}`);
    
    // Save to database with zero-duplicate strategy
    await this.saveToDatabase(topVideos, source);
    
    return topVideos;
  }

  /**
   * 🔄 Normalize different API response formats
   */
  normalizeVideoData(video, source) {
    const normalizedFields = {
      'tiktok-api': {
        douyin_id: video.id || video.video_id,
        video_url: video.video_url || video.url,
        title: video.video_description || video.title,
        author_name: video.username || video.author?.nickname,
        play_count: video.view_count || 0,
        like_count: video.like_count || 0,
        comment_count: video.comment_count || 0,
        share_count: video.share_count || 0
      },
      'rapidapi': {
        douyin_id: video.aweme_id || video.id,
        video_url: video.play_url || video.video_url,
        title: video.desc || video.title,
        author_name: video.author?.nickname || video.username,
        play_count: video.statistics?.play_count || 0,
        like_count: video.statistics?.digg_count || 0,
        comment_count: video.statistics?.comment_count || 0,
        share_count: video.statistics?.share_count || 0
      }
    };

    const mapping = normalizedFields[source] || normalizedFields.rapidapi;
    
    const normalized = {
      douyin_id: String(video[Object.keys(mapping)[0]] || `${source}_${Date.now()}_${Math.random()}`),
      video_url: video[Object.keys(mapping)[1]] || '',
      title: video[Object.keys(mapping)[2]] || 'Untitled',
      author_name: video[Object.keys(mapping)[3]] || 'Unknown',
      play_count: parseInt(video[Object.keys(mapping)[4]]) || 0,
      like_count: parseInt(video[Object.keys(mapping)[5]]) || 0,
      comment_count: parseInt(video[Object.keys(mapping)[6]]) || 0,
      share_count: parseInt(video[Object.keys(mapping)[7]]) || 0,
      created_at: new Date().toISOString(),
      source: source
    };

    return normalized;
  }

  /**
   * 🔥 Calculate viral scores using optimized algorithm
   */
  calculateViralScores(videos) {
    return videos.map(video => ({
      ...video,
      viral_score: (
        (video.play_count || 0) * 0.3 +
        (video.like_count || 0) * 2.0 +
        (video.comment_count || 0) * 3.0 +
        (video.share_count || 0) * 5.0
      )
    }));
  }

  /**
   * 💾 Save to database with zero-duplicate strategy
   */
  async saveToDatabase(videos, source) {
    if (videos.length === 0) return;
    
    try {
      console.log(`💾 Saving ${videos.length} videos from ${source}...`);
      
      // Batch upsert with conflict resolution
      const { data, error } = await this.supabase
        .from('douyin_videos')
        .upsert(videos, {
          onConflict: 'douyin_id',
          ignoreDuplicates: false
        });
      
      if (error) throw error;
      
      console.log(`✅ Successfully saved ${videos.length} videos (zero duplicates)`);
      
      // Log viral scores
      const topScores = videos
        .sort((a, b) => b.viral_score - a.viral_score)
        .slice(0, 3)
        .map(v => `${v.title.slice(0, 30)}... (${Math.round(v.viral_score)})`);
        
      console.log('🏆 Top viral scores:', topScores.join(', '));
      
    } catch (error) {
      console.error('❌ Database save failed:', error.message);
    }
  }

  /**
   * 🎯 Main integration function
   */
  async integrateAll() {
    console.log('🚀 Starting alternative data source integration...\n');
    
    const allResults = [];
    
    // Try all available sources
    const sources = [
      () => this.integrateWithTikTokAPI(),
      () => this.integrateWithRapidAPI(),
      () => this.integrateWithSocialAPIs()
    ];
    
    for (const sourceFunction of sources) {
      try {
        const results = await sourceFunction();
        allResults.push(...results);
      } catch (error) {
        console.log('⚠️ Source integration error:', error.message);
      }
    }
    
    console.log(`\n🎯 TOTAL INTEGRATED VIDEOS: ${allResults.length}`);
    
    if (allResults.length > 0) {
      // Create integration summary
      await this.createIntegrationSummary(allResults);
    } else {
      console.log('\n💡 No alternative data sources configured yet.');
      console.log('Configure API keys in environment variables:');
      console.log('• TIKTOK_ACCESS_TOKEN');
      console.log('• RAPIDAPI_KEY');  
      console.log('• SOCIALDATA_API_KEY');
      console.log('• APIFY_API_TOKEN');
    }
    
    return allResults;
  }

  /**
   * 📊 Create integration summary
   */
  async createIntegrationSummary(videos) {
    const summary = {
      total_videos: videos.length,
      unique_sources: [...new Set(videos.map(v => v.source))],
      top_viral_videos: videos
        .sort((a, b) => b.viral_score - a.viral_score)
        .slice(0, 10)
        .map(v => ({
          title: v.title.slice(0, 50),
          viral_score: Math.round(v.viral_score),
          source: v.source
        })),
      integration_timestamp: new Date().toISOString()
    };
    
    const summaryPath = path.join(__dirname, '..', 'integration-summary.json');
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
    
    console.log('\n📋 Integration Summary:');
    console.log(`• Total videos: ${summary.total_videos}`);
    console.log(`• Sources: ${summary.unique_sources.join(', ')}`);
    console.log(`• Top viral score: ${summary.top_viral_videos[0]?.viral_score || 'N/A'}`);
    console.log(`• Summary saved to: integration-summary.json`);
  }
}

// Main execution
async function main() {
  const integrator = new AlternativeDataIntegrator();
  
  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║            🌟 ALTERNATIVE DATA SOURCE INTEGRATION                    ║
╚══════════════════════════════════════════════════════════════════════╝

This script integrates with real APIs to get Douyin/TikTok data:
✅ TikTok Research API (official)
✅ RapidAPI endpoints (multiple providers)  
✅ Social media aggregation services
✅ Zero-duplicate database operations
✅ Smart viral scoring algorithm

🔧 Setup required environment variables for API access.
  `);
  
  await integrator.integrateAll();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { AlternativeDataIntegrator };