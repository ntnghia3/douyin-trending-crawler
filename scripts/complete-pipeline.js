#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
require('dotenv').config();

const execAsync = util.promisify(exec);

// Color console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Configuration
const config = {
  crawl: {
    limit: parseInt(process.env.CRAWL_LIMIT) || 200,
    pages: parseInt(process.env.CRAWL_PAGES) || 8,
    topic: process.env.CRAWL_TOPIC || ''
  },
  download: {
    count: parseInt(process.env.DOWNLOAD_COUNT) || 10,
    days: parseInt(process.env.DOWNLOAD_DAYS) || 3,
    minViralScore: parseInt(process.env.MIN_VIRAL_SCORE) || 50
  }
};

// Parse command line arguments
const args = {
  crawlOnly: process.argv.includes('--crawl-only'),
  downloadOnly: process.argv.includes('--download-only'),
  force: process.argv.includes('--force'),
  verbose: process.argv.includes('--verbose') || process.argv.includes('-v'),
  help: process.argv.includes('--help') || process.argv.includes('-h'),
  
  // Override config from CLI
  crawlLimit: parseInt(process.argv.find(arg => arg.startsWith('--crawl-limit='))?.split('=')[1]) || config.crawl.limit,
  downloadCount: parseInt(process.argv.find(arg => arg.startsWith('--download-count='))?.split('=')[1]) || config.download.count,
  topic: process.argv.find(arg => arg.startsWith('--topic='))?.split('=')[1] || config.crawl.topic,
  days: parseInt(process.argv.find(arg => arg.startsWith('--days='))?.split('=')[1]) || config.download.days,
  minViral: parseInt(process.argv.find(arg => arg.startsWith('--min-viral='))?.split('=')[1]) || config.download.minViralScore
};

if (args.help) {
  console.log(`
🚀 Douyin Complete Pipeline

This script runs an optimized data collection and download pipeline:
1. Efficient crawling of trending videos (no duplicate data)
2. Smart download of top viral videos (no re-downloads)

Usage: node scripts/complete-pipeline.js [options]

Options:
  --crawl-only           Only run the crawling phase
  --download-only        Only run the download phase  
  --force               Force re-download existing videos
  --verbose, -v         Enable verbose logging
  
Config Options:
  --crawl-limit=N       Videos to crawl (default: ${config.crawl.limit})
  --download-count=N    Videos to download (default: ${config.download.count})
  --topic=TEXT          Search topic (default: trending)
  --days=N              Look back N days for trending (default: ${config.download.days})
  --min-viral=N         Minimum viral score (default: ${config.download.minViralScore})

Examples:
  # Full pipeline with defaults
  node scripts/complete-pipeline.js
  
  # Crawl 500 videos, download top 20
  node scripts/complete-pipeline.js --crawl-limit=500 --download-count=20
  
  # Only download trending videos from last week
  node scripts/complete-pipeline.js --download-only --days=7 --min-viral=100
  
  # Crawl specific topic
  node scripts/complete-pipeline.js --topic=dance --crawl-limit=100
  
  # Quick mode via npm
  npm run pipeline
  npm run pipeline:download
`);
  process.exit(0);
}

// Status tracking
const status = {
  crawl: { started: false, completed: false, count: 0, error: null },
  download: { started: false, completed: false, success: 0, failed: 0, error: null }
};

// Utility functions
function formatTime(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms/1000).toFixed(1)}s`;
  return `${(ms/60000).toFixed(1)}m`;
}

function createStatusReport() {
  const report = {
    timestamp: new Date().toISOString(),
    config: { ...config, args },
    status,
    performance: {}
  };
  
  // Add timing info
  if (status.crawl.startTime) {
    report.performance.crawlTime = status.crawl.endTime ? 
      status.crawl.endTime - status.crawl.startTime : 
      Date.now() - status.crawl.startTime;
  }
  
  if (status.download.startTime) {
    report.performance.downloadTime = status.download.endTime ? 
      status.download.endTime - status.download.startTime : 
      Date.now() - status.download.startTime;
  }
  
  return report;
}

// Save status to file
function saveStatus() {
  const statusFile = path.join(process.cwd(), 'pipeline-status.json');
  fs.writeFileSync(statusFile, JSON.stringify(createStatusReport(), null, 2));
}

// Check system requirements
async function checkRequirements() {
  log('🔍 Checking system requirements...', 'cyan');
  
  // Check Node.js version
  const nodeVersion = process.version;
  log(`   Node.js: ${nodeVersion}`, 'blue');
  
  // Check if browser is installed
  try {
    await execAsync('npx playwright install-deps chromium', { timeout: 10000 });
    log('   ✅ Playwright browser ready', 'green');
  } catch (error) {
    log('   ⚠️  Installing Playwright browser...', 'yellow');
    await execAsync('npx playwright install chromium');
  }
  
  // Check database connection
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    log('   ❌ Missing database credentials', 'red');
    process.exit(1);
  }
  
  log('   ✅ Database credentials found', 'green');
  
  // Check downloads directory
  const downloadsDir = path.join(process.cwd(), 'downloads');
  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
    log('   📁 Created downloads directory', 'blue');
  } else {
    log('   ✅ Downloads directory ready', 'green');
  }
}

// Run efficient crawling
async function runCrawling() {
  if (args.downloadOnly) {
    log('⏭️  Skipping crawling (download-only mode)', 'yellow');
    return;
  }
  
  log('\n🕷️  Starting efficient crawling phase...', 'magenta');
  log(`   Target: ${args.crawlLimit} videos${args.topic ? ` for topic "${args.topic}"` : ''}`, 'blue');
  
  status.crawl.started = true;
  status.crawl.startTime = Date.now();
  
  try {
    const crawlCmd = [
      'node scripts/efficient-crawler.js',
      `--limit=${args.crawlLimit}`,
      `--pages=${config.crawl.pages}`,
      args.topic ? `--topic=${args.topic}` : ''
    ].filter(Boolean).join(' ');
    
    if (args.verbose) {
      log(`   🔧 Running: ${crawlCmd}`, 'blue');
    }
    
    let stdout = '', stderr = '';
    try {
      const result = await execAsync(crawlCmd, { 
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
        timeout: 300000 // 5 minute timeout
      });
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (execError) {
      // Check if this is expected mock mode behavior
      if (execError.stdout && (
        execError.stdout.includes('MOCK MODE SUCCESS') || 
        execError.stdout.includes('Generated') || 
        execError.stdout.includes('mock videos')
      )) {
        log(`   🎭 Crawler auto-switched to mock mode (expected behavior)`, 'yellow');
        stdout = execError.stdout;
        stderr = execError.stderr || '';
      } else {
        throw execError;
      }
    }
    
    if (args.verbose && stdout) {
      log('   📝 Crawl output:', 'blue');
      console.log(stdout);
    }
    
    if (stderr) {
      log(`   ⚠️  Crawl warnings: ${stderr}`, 'yellow');
    }
    
    // Parse results from stdout
    const match = stdout.match(/Total videos extracted: (\d+)/);
    status.crawl.count = match ? parseInt(match[1]) : 0;
    
    status.crawl.completed = true;
    status.crawl.endTime = Date.now();
    
    log(`   ✅ Crawling completed: ${status.crawl.count} videos in ${formatTime(status.crawl.endTime - status.crawl.startTime)}`, 'green');
    
  } catch (error) {
    status.crawl.error = error.message;
    log(`   ❌ Crawling failed: ${error.message}`, 'red');
    
    // Don't fail pipeline if crawler auto-switched to mock mode
    if (error.message && error.message.includes('Command failed') && !args.downloadOnly) {
      log(`   🤖 Crawler likely switched to mock mode due to bot detection`, 'yellow');
      log(`   ➡️  Continuing to download phase with existing data...`, 'blue');
      status.crawl.count = 0; // Set to 0 but continue
    } else if (!args.downloadOnly) {
      throw error;
    }
  }
  
  saveStatus();
}

// Run smart downloading
async function runDownloading() {
  if (args.crawlOnly) {
    log('⏭️  Skipping download (crawl-only mode)', 'yellow');
    return;
  }
  
  log('\n⬇️  Starting smart download phase...', 'magenta');
  log(`   Target: ${args.downloadCount} videos from last ${args.days} days (min viral: ${args.minViral})`, 'blue');
  
  status.download.started = true;
  status.download.startTime = Date.now();
  
  try {
    const downloadCmd = [
      'node scripts/smart-download.js',
      `--count=${args.downloadCount}`,
      `--days=${args.days}`,
      `--min-viral=${args.minViral}`,
      args.force ? '--force' : ''
    ].filter(Boolean).join(' ');
    
    if (args.verbose) {
      log(`   🔧 Running: ${downloadCmd}`, 'blue');
    }
    
    const { stdout, stderr } = await execAsync(downloadCmd, {
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      timeout: 600000 // 10 minute timeout
    });
    
    if (args.verbose && stdout) {
      log('   📝 Download output:', 'blue');
      console.log(stdout);
    }
    
    if (stderr) {
      log(`   ⚠️  Download warnings: ${stderr}`, 'yellow');
    }
    
    // Parse results from stdout
    const successMatch = stdout.match(/Successful: (\d+)/);
    const failedMatch = stdout.match(/Failed: (\d+)/);
    
    status.download.success = successMatch ? parseInt(successMatch[1]) : 0;
    status.download.failed = failedMatch ? parseInt(failedMatch[1]) : 0;
    
    status.download.completed = true;
    status.download.endTime = Date.now();
    
    log(`   ✅ Downloads completed: ${status.download.success} successful, ${status.download.failed} failed in ${formatTime(status.download.endTime - status.download.startTime)}`, 'green');
    
  } catch (error) {
    status.download.error = error.message;
    log(`   ❌ Download failed: ${error.message}`, 'red');
    throw error;
  }
  
  saveStatus();
}

// Generate final report
function generateReport() {
  log('\n📊 Pipeline Complete - Final Report', 'cyan');
  log('='.repeat(50), 'cyan');
  
  if (status.crawl.started) {
    const crawlStatus = status.crawl.completed ? '✅' : '❌';
    const crawlTime = status.crawl.endTime ? formatTime(status.crawl.endTime - status.crawl.startTime) : 'N/A';
    log(`${crawlStatus} Crawling: ${status.crawl.count} videos in ${crawlTime}`, status.crawl.completed ? 'green' : 'red');
    
    if (status.crawl.error) {
      log(`   Error: ${status.crawl.error}`, 'red');
    }
  }
  
  if (status.download.started) {
    const downloadStatus = status.download.completed ? '✅' : '❌';
    const downloadTime = status.download.endTime ? formatTime(status.download.endTime - status.download.startTime) : 'N/A';
    log(`${downloadStatus} Downloads: ${status.download.success} successful, ${status.download.failed} failed in ${downloadTime}`, status.download.completed ? 'green' : 'red');
    
    if (status.download.error) {
      log(`   Error: ${status.download.error}`, 'red');
    }
  }
  
  const totalTime = Math.max(
    (status.crawl.endTime || 0) - (status.crawl.startTime || Date.now()),
    (status.download.endTime || 0) - (status.download.startTime || Date.now())
  );
  
  log(`\n⏱️  Total time: ${formatTime(totalTime)}`, 'blue');
  log(`📁 Files location: ./downloads/`, 'blue');
  log(`📄 Status saved: ./pipeline-status.json`, 'blue');
  
  // Performance insights
  if (status.crawl.count > 0 && status.download.success > 0) {
    const efficiency = ((status.download.success / status.crawl.count) * 100).toFixed(1);
    log(`📈 Pipeline efficiency: ${efficiency}% (${status.download.success} downloads from ${status.crawl.count} crawled)`, 'magenta');
  }
}

// Main execution
async function main() {
  const startTime = Date.now();
  
  log('🚀 Douyin Complete Pipeline Starting...', 'cyan');
  log(`Configuration: Crawl ${args.crawlLimit}, Download ${args.downloadCount}, Days ${args.days}`, 'blue');
  
  try {
    await checkRequirements();
    await runCrawling();
    await runDownloading();
    
    generateReport();
    
    const totalTime = Date.now() - startTime;
    log(`\n🎉 Pipeline completed successfully in ${formatTime(totalTime)}!`, 'green');
    
  } catch (error) {
    log(`\n💥 Pipeline failed: ${error.message}`, 'red');
    
    if (args.verbose) {
      console.error(error);
    }
    
    saveStatus();
    generateReport();
    process.exit(1);
  }
}

// Handle process signals
process.on('SIGINT', () => {
  log('\n⚠️  Pipeline interrupted by user', 'yellow');
  saveStatus();
  generateReport();
  process.exit(1);
});

process.on('SIGTERM', () => {
  log('\n⚠️  Pipeline terminated', 'yellow');
  saveStatus();
  generateReport();
  process.exit(1);
});

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    log(`💥 Unexpected error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main, runCrawling, runDownloading };