import { createClient, SupabaseClient } from '@supabase/supabase-js';

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-url.supabase.co';
const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

let browserClient: SupabaseClient | null = null;

// Lazy initialized browser-safe client
export function getSupabase(): SupabaseClient {
  if (!browserClient) {
    browserClient = createClient(supabaseUrl, supabaseAnonKey);
  }
  return browserClient;
}

// Server-side Service Role client (NEVER exposed to frontend)
export function getServiceSupabase(): SupabaseClient {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-key';
  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
