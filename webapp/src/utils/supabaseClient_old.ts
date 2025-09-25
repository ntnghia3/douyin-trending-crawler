// Supabase client config
import { createClient } from '@supabase/supabase-js';

// Temporarily hardcode values since env vars aren't loading in Codespaces
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qqrjyhhyqvrlgladleck.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxcmp5aGh5cXZybGdsYWRsZWNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc3ODE1MDMsImV4cCI6MjA3MzM1NzUwM30.cwj1iHZh-kadgrtlI-39lcQ-jYG_pDMhx7JwwQkU3KA';

// Always create the real client now
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

if (isDevelopment) {
  console.warn('⚠️  Using mock Supabase client - please configure your environment variables');
  // Create a mock client that won't break the app
  supabase = {
    from: () => ({
      select: () => Promise.resolve({ data: [], error: null }),
      insert: () => Promise.resolve({ data: null, error: null }),
      update: () => Promise.resolve({ data: null, error: null }),
      delete: () => Promise.resolve({ data: null, error: null }),
    }),
    auth: {
      signUp: () => Promise.resolve({ data: null, error: null }),
      signIn: () => Promise.resolve({ data: null, error: null }),
      signOut: () => Promise.resolve({ error: null }),
    }
  };
} else {
  // Validate required environment variables for production
  if (!supabaseUrl) {
    throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_URL');
  }

  if (!supabaseAnonKey) {
    throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  supabase = createClient(supabaseUrl, supabaseAnonKey);
}

export { supabase };
