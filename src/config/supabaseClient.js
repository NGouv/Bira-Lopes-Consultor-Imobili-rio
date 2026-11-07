import { createClient } from "@supabase/supabase-js";

let supabaseClient;

export function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;

  const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY } = import.meta.env;
  if (!VITE_SUPABASE_URL || !VITE_SUPABASE_ANON_KEY) {
    throw new Error(
      "Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.",
    );
  }

  let projectUrl;
  try {
    projectUrl = new URL(VITE_SUPABASE_URL);
  } catch {
    throw new Error("VITE_SUPABASE_URL precisa ser uma URL válida.");
  }

  if (!["https:", "http:"].includes(projectUrl.protocol)) {
    throw new Error("VITE_SUPABASE_URL precisa usar HTTP ou HTTPS.");
  }

  supabaseClient = createClient(projectUrl.origin, VITE_SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  });

  return supabaseClient;
}
