import { createClient } from "@supabase/supabase-js";

let supabaseClient;

function resolveSupabaseConfig() {
  const env = import.meta.env ?? {};
  const globalConfig = globalThis.__BIRA_SUPABASE__ ?? {};
  const url = env.VITE_SUPABASE_URL || globalConfig.url;
  const anonKey = env.VITE_SUPABASE_ANON_KEY || globalConfig.anonKey;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no ambiente da aplicação antes do deploy.",
    );
  }

  return { url, anonKey };
}

export function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;

  const { url, anonKey } = resolveSupabaseConfig();

  let projectUrl;
  try {
    projectUrl = new URL(url);
  } catch {
    throw new Error("VITE_SUPABASE_URL precisa ser uma URL válida.");
  }

  if (!["https:", "http:"].includes(projectUrl.protocol)) {
    throw new Error("VITE_SUPABASE_URL precisa usar HTTP ou HTTPS.");
  }

  supabaseClient = createClient(projectUrl.origin, anonKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  });

  return supabaseClient;
}
