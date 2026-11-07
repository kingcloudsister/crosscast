import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

// Browser client that keeps the auth session in cookies, so middleware.ts can read it on every request.
export const supabase = isSupabaseConfigured ? createBrowserClient(supabaseUrl!, supabaseKey!) : null;
