import { getSupabaseClient } from "../config/supabaseClient.js";
import { validateLead } from "./validation.js";

export async function submitLead(input, turnstileToken, honeypot = "") {
  const lead = validateLead(input);
  if (typeof turnstileToken !== "string" || !turnstileToken) {
    throw new Error("Conclua a verificação de segurança antes de enviar.");
  }

  const { data, error } = await getSupabaseClient().functions.invoke("submit-lead", {
    body: { lead, turnstileToken, honeypot },
  });

  if (error) throw error;
  if (!data?.success) {
    throw new Error(data?.error || "Não foi possível enviar sua mensagem.");
  }
}
