import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Privileged Supabase client.
 *
 * This client must only be imported by server-side modules and Route Handlers.
 * Never pass its key or client instance to browser code.
 */
let adminClient: ReturnType<typeof createClient> | null = null;

export function createSupabaseAdminClient() {
  if (adminClient) return adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error("Server-side Supabase credentials are not configured.");
  }

  adminClient = createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  return adminClient;
}
