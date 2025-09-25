// Supabase client config
import { createClient } from '@supabase/supabase-js';

// Temporarily hardcode values since env vars aren't loading properly in Codespaces
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qqrjyhhyqvrlgladleck.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxcmp5aGh5cXZybGdsYWRsZWNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc3ODE1MDMsImV4cCI6MjA3MzM1NzUwM30.cwj1iHZh-kadgrtlI-39lcQ-jYG_pDMhx7JwwQkU3KA';

// Create and export the Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

console.log('✅ Supabase client created successfully');
console.log('SUPABASE_URL:', supabaseUrl);
console.log('SUPABASE_ANON_KEY:', supabaseAnonKey ? '***provided***' : 'missing');