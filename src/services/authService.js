import { getSupabaseClient } from "../config/supabaseClient.js";

async function clearUnverifiedSession(client, reason) {
  const { error: signOutError } = await client.auth.signOut();
  if (signOutError) {
    throw new AggregateError(
      [reason, signOutError],
      "Não foi possível confirmar a autorização nem encerrar a sessão.",
    );
  }
  throw reason;
}

export async function signInAdmin(email, password) {
  if (typeof email !== "string" || !email.trim() || typeof password !== "string" || !password) {
    throw new TypeError("Informe e-mail e senha.");
  }

  const client = getSupabaseClient();
  const { data: authData, error: authError } = await client.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (authError) throw authError;

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("id,name,email,role")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError) {
    await clearUnverifiedSession(client, profileError);
  }
  if (!profile || profile.role !== "admin") {
    await clearUnverifiedSession(
      client,
      new Error("Usuário sem autorização para acessar a área administrativa."),
    );
  }

  return profile;
}

export async function signOutAdmin() {
  const { error } = await getSupabaseClient().auth.signOut();
  if (error) throw error;
}

export async function getAdminProfile() {
  const client = getSupabaseClient();
  const { data: authData, error: authError } = await client.auth.getUser();

  if (authError) throw authError;
  if (!authData.user) return null;

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("id,name,email,role")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError) throw profileError;
  return profile?.role === "admin" ? profile : null;
}
