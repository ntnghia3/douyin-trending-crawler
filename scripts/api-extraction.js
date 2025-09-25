#!/usr/bin/env node

const https = require('https');
const axios = require('axios');
const crypto = require('crypto');

/**
 * Douyin API Reverse Engineering Approach
 * Thử các API endpoints được tìm thấy từ mobile app
 */

class DouyinAPIExtractor {
  constructor() {
    this.baseHeaders = {
      'User-Agent': 'com.ss.android.ugc.aweme/160901 (Linux; U; Android 9; zh_CN; SM-G973F; wv) Cronet/58.0.2991.0',
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
    };
  }

  // Generate signature for API requests (basic version)
  generateSignature(params) {
    const keys = Object.keys(params).sort();
    const query = keys.map(key => `${key}=${params[key]}`).join('&');
    return crypto.createHash('md5').update(query + 'douyin_secret_key').digest('hex');
  }

  async tryWebAPI() {
    console.log('🌐 Trying Douyin Web API endpoints...');
    
    const endpoints = [
      {
        name: 'Recommend Feed',
        url: 'https://www.douyin.com/aweme/v1/web/aweme/post/',
        params: {
          device_platform: 'webapp',
          aid: '6383',
          channel: 'channel_pc_web',
          pc_client_type: '1',
          version_code: '170400',
          version_name: '17.4.0',
          cookie_enabled: 'true',
          screen_width: '1366',
          screen_height: '768',
          browser_language: 'zh-CN',
          browser_platform: 'Win32',
          browser_name: 'Chrome',
          browser_version: '120.0.0.0'
        }
      },
      {
        name: 'Search API',
        url: 'https://www.douyin.com/aweme/v1/web/search/item/',
        params: {
          device_platform: 'webapp',
          aid: '6383',
          channel: 'channel_pc_web',
          search_channel: 'aweme_video_web',
          keyword: 'music',
          search_source: 'tab_search',
          query_correct_type: '1',
          is_filter_search: '0',
          from_group_id: '',
          offset: '0',
          count: '20'
        }
      },
      {
        name: 'Hot Search',
        url: 'https://www.douyin.com/aweme/v1/web/hot/search/list/',
        params: {
          device_platform: 'webapp',
          aid: '6383',
          channel: 'channel_pc_web'
        }
      }
    ];

    for (const endpoint of endpoints) {
      try {
        console.log(`📡 Testing ${endpoint.name}...`);
        
        const response = await axios.get(endpoint.url, {
          params: endpoint.params,
          headers: this.baseHeaders,
          timeout: 10000
        });
        
        console.log(`✅ ${endpoint.name}: Status ${response.status}`);
        console.log(`   Response size: ${JSON.stringify(response.data).length} chars`);
        
        if (response.data && response.data.aweme_list) {
          console.log(`🎬 Found ${response.data.aweme_list.length} videos!`);
          return this.parseVideoData(response.data.aweme_list);
        } else if (response.data && response.data.data) {
          console.log(`📊 Got data: ${Object.keys(response.data.data)}`);
        }
        
      } catch (error) {
        console.log(`❌ ${endpoint.name}: ${error.message}`);
        if (error.response) {
          console.log(`   Status: ${error.response.status}`);
          console.log(`   Headers: ${JSON.stringify(error.response.headers, null, 2)}`);
        }
      }
    }
    
    return [];
  }

  async tryMobileAPI() {
    console.log('📱 Trying Douyin Mobile API endpoints...');
    
    const mobileEndpoints = [
      {
        name: 'Mobile Feed',
        url: 'https://aweme-eagle-hl.jinritemai.com/aweme/v2/feed/',
        params: {
          type: '0',
          max_cursor: '0',
          min_cursor: '0',
          count: '20',
          volume: '0.5',
          pull_type: '1'
        }
      },
      {
        name: 'Mobile Search',
        url: 'https://aweme-hl.snssdk.com/aweme/v1/search/item/',
        params: {
          keyword: 'trending',
          offset: '0',
          count: '20',
          type: '1',
          search_source: 'video_search'
        }
      }
    ];

    for (const endpoint of mobileEndpoints) {
      try {
        console.log(`📱 Testing ${endpoint.name}...`);
        
        const mobileHeaders = {
          ...this.baseHeaders,
          'User-Agent': 'okhttp/3.10.0.1 Dalvik/2.1.0 (Linux; U; Android 9; SM-G973F Build/PPR1.180610.011)',
          'X-SS-REQ-TICKET': Date.now().toString(),
          'X-Tt-Token': '00' + Date.now().toString() + '00'
        };
        
        const response = await axios.get(endpoint.url, {
          params: endpoint.params,
          headers: mobileHeaders,
          timeout: 10000
        });
        
        console.log(`✅ ${endpoint.name}: Status ${response.status}`);
        
        if (response.data && response.data.aweme_list) {
          console.log(`🎬 Found ${response.data.aweme_list.length} videos!`);
          return this.parseVideoData(response.data.aweme_list);
        }
        
      } catch (error) {
        console.log(`❌ ${endpoint.name}: ${error.message}`);
      }
    }
    
    return [];
  }

  async tryWebScraping() {
    console.log('🕷️ Trying direct web scraping với cURL simulation...');
    
    const curlHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'max-age=0'
    };

    const urls = [
      'https://www.douyin.com/discover',
      'https://www.douyin.com/search/music',
      'https://m.douyin.com/search/trending'
    ];

    for (const url of urls) {
      try {
        console.log(`🌐 Scraping: ${url}`);
        
        const response = await axios.get(url, {
          headers: curlHeaders,
          timeout: 15000,
          maxRedirects: 5
        });
        
        console.log(`✅ Response: ${response.status} (${response.data.length} chars)`);
        
        // Look for video data in HTML
        const videoMatches = response.data.match(/aweme_id["']?:\s*["']?(\d+)/g) || [];
        const videoIds = videoMatches.map(match => match.match(/(\d+)/)[1]);
        
        if (videoIds.length > 0) {
          console.log(`🎬 Found ${videoIds.length} video IDs in HTML!`);
          videoIds.slice(0, 5).forEach((id, i) => {
            console.log(`   ${i+1}. ${id}`);
          });
          
          return videoIds.map(id => ({
            douyin_id: id,
            source: 'web_scraping',
            url: url
          }));
        }
        
        // Look for JSON data
        const jsonMatches = response.data.match(/<script[^>]*>(.*?aweme.*?)<\/script>/gs) || [];
        if (jsonMatches.length > 0) {
          console.log(`📊 Found ${jsonMatches.length} script blocks with aweme data`);
        }
        
      } catch (error) {
        console.log(`❌ Failed to scrape ${url}: ${error.message}`);
      }
    }
    
    return [];
  }

  parseVideoData(awemeList) {
    return awemeList.map(aweme => ({
      douyin_id: aweme.aweme_id,
      title: aweme.desc || '',
      author_name: aweme.author?.nickname || '',
      author_id: aweme.author?.uid || '',
      video_url: aweme.video?.play_addr?.url_list?.[0] || '',
      cover_url: aweme.video?.cover?.url_list?.[0] || '',
      play_count: aweme.statistics?.play_count || 0,
      like_count: aweme.statistics?.digg_count || 0,
      comment_count: aweme.statistics?.comment_count || 0,
      share_count: aweme.statistics?.share_count || 0,
      create_time: aweme.create_time,
      source: 'api_extraction'
    }));
  }

  async extractVideos() {
    console.log('🚀 Starting Douyin API extraction...');
    
    let allVideos = [];
    
    // Try all methods
    const webVideos = await this.tryWebAPI();
    const mobileVideos = await this.tryMobileAPI(); 
    const scrapedVideos = await this.tryWebScraping();
    
    allVideos = [...webVideos, ...mobileVideos, ...scrapedVideos];
    
    // Remove duplicates
    const uniqueVideos = allVideos.filter((video, index, self) => 
      index === self.findIndex(v => v.douyin_id === video.douyin_id)
    );
    
    console.log(`\n🎯 Total unique videos found: ${uniqueVideos.length}`);
    
    if (uniqueVideos.length > 0) {
      uniqueVideos.slice(0, 5).forEach((video, i) => {
        console.log(`${i+1}. ${video.douyin_id} - "${video.title || 'No title'}" (${video.source})`);
      });
    }
    
    return uniqueVideos;
  }
}

async function main() {
  const extractor = new DouyinAPIExtractor();
  
  try {
    const videos = await extractor.extractVideos();
    
    if (videos.length > 0) {
      console.log('\n🎉 SUCCESS! Real Douyin videos extracted!');
      
      // Save results
      const fs = require('fs');
      const path = require('path');
      const outputFile = path.join(__dirname, '..', 'real-videos-extracted.json');
      
      fs.writeFileSync(outputFile, JSON.stringify({
        timestamp: new Date().toISOString(),
        total_videos: videos.length,
        videos: videos
      }, null, 2));
      
      console.log(`📄 Results saved to: real-videos-extracted.json`);
      console.log(`💾 Ready for integration with download system!`);
      
    } else {
      console.log('\n❌ No real videos could be extracted');
      console.log('\n💡 Advanced solutions needed:');
      console.log('   🔧 Residential proxy rotation');
      console.log('   📱 Mobile app API reverse engineering');
      console.log('   🤝 Third-party Douyin data providers');
      console.log('   ⚡ Real-time browser automation with human simulation');
    }
    
  } catch (error) {
    console.error('💥 API extraction failed:', error.message);
  }
}

if (require.main === module) {
  main();
}

module.exports = { DouyinAPIExtractor };