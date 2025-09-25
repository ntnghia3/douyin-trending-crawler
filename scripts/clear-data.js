require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function clearAllData() {
  console.log('🗑️ Clearing all data from database...');
  
  try {
    // Clear download jobs first (foreign key constraint)
    console.log('Deleting download jobs...');
    const { error: jobsError } = await supabase
      .from('download_jobs')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (jobsError) {
      console.log('Note: download_jobs table may not exist yet:', jobsError.message);
    } else {
      console.log('✅ Download jobs cleared');
    }

    // Clear videos table
    console.log('Deleting videos...');
    const { error: videosError, count } = await supabase
      .from('videos')
      .delete()
      .neq('id', 'non-existent-id'); // Delete all

    if (videosError) {
      console.error('❌ Error deleting videos:', videosError);
    } else {
      console.log(`✅ Deleted all videos (${count || 'unknown'} records)`);
    }

    // Optional: Clear storage bucket
    console.log('Checking storage bucket...');
    const { data: files, error: listError } = await supabase.storage
      .from('videos')
      .list();

    if (listError) {
      console.log('Note: videos bucket may not exist yet:', listError.message);
    } else if (files && files.length > 0) {
      console.log(`Found ${files.length} files in storage bucket`);
      
      const filePaths = files.map(file => file.name);
      const { error: deleteError } = await supabase.storage
        .from('videos')
        .remove(filePaths);

      if (deleteError) {
        console.error('❌ Error deleting storage files:', deleteError);
      } else {
        console.log('✅ Storage files cleared');
      }
    } else {
      console.log('✅ Storage bucket is already empty');
    }

    console.log('🎉 All data cleared successfully!');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the cleanup
clearAllData();