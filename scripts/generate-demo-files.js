#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Enhanced Mock Mode - Generate Sample MP4 Files for Demo
 */

async function generateSampleMP4Files() {
  const downloadsDir = path.join(__dirname, '..', 'downloads');
  
  console.log('🎬 Generating Sample MP4 Files for Demo...\n');
  
  // Mock video data matching the smart download output
  const mockVideos = [
    { id: '7541758818605474461', title: 'Music performance', size: 5710 },
    { id: '7541758818649670723', title: 'Amazing dance moves', size: 2836 },
    { id: '7541758819428149669', title: 'Workout routine', size: 3941 },
    { id: '7541758818605474477', title: 'Cooking tutorial', size: 5565 }
  ];
  
  console.log('📁 Creating sample MP4 files in ./downloads/');
  
  for (let i = 0; i < mockVideos.length; i++) {
    const video = mockVideos[i];
    const filename = `douyin_${video.id}_${Date.now() + i * 1000}.mp4`;
    const filepath = path.join(downloadsDir, filename);
    
    // Create a minimal MP4 file structure (just headers for demo)
    const mp4Header = Buffer.from([
      0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, // ftyp box
      0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
      0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
      0x61, 0x76, 0x63, 0x31, 0x6d, 0x70, 0x34, 0x31
    ]);
    
    // Pad to simulate actual file size (in KB)
    const targetSize = video.size * 1024;
    const padding = Buffer.alloc(Math.max(0, targetSize - mp4Header.length), 0);
    const fileContent = Buffer.concat([mp4Header, padding]);
    
    fs.writeFileSync(filepath, fileContent);
    
    console.log(`   ✅ Created: ${filename} (${(fileContent.length / 1024).toFixed(1)} KB)`);
    console.log(`      Title: ${video.title}`);
  }
  
  console.log(`\n🎉 Generated ${mockVideos.length} sample MP4 files!`);
  console.log('📁 Location: ./downloads/');
  console.log('💡 These are demo files with valid MP4 headers but no actual video content');
  
  // List all files in downloads
  console.log('\n📋 All files in downloads folder:');
  const allFiles = fs.readdirSync(downloadsDir);
  allFiles.forEach(file => {
    const stats = fs.statSync(path.join(downloadsDir, file));
    const sizeKB = (stats.size / 1024).toFixed(1);
    console.log(`   📹 ${file} (${sizeKB} KB)`);
  });
  
  console.log(`\n🎯 Total: ${allFiles.length} video files`);
}

if (require.main === module) {
  generateSampleMP4Files().catch(console.error);
}

module.exports = { generateSampleMP4Files };