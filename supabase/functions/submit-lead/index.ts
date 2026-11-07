import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[+()0-9 .-]{8,24}$/;
const interestTypes = new Set(["comprar", "investir", "empreendimento"]);
const trackingFields = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
] as const;

function response(status: number, body: Record<string, unknown>, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Access-Control-Allow-Origin": origin,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function cleanText(value: unknown, maximum: number) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new Error("invalid_input");
  const text = value.trim();
  if (!text || text.length > maximum) throw new Error("invalid_input");
  return text;
}

function cleanUrl(value: unknown) {
  const text = cleanText(value, 2048);
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error("invalid_input");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("invalid_input");
  return url.href;
}

function validateLead(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid_input");
  }
  const input = value as Record<string, unknown>;
  const nome = cleanText(input.nome, 120);
  const email = cleanText(input.email, 254);
  const telefone = cleanText(input.telefone, 24);
  const mensagem = cleanText(input.mensagem, 2000);
  const tipoInteresse = input.tipo_interesse;

  if (
    !nome || nome.length < 2 ||
    (email && !emailPattern.test(email)) ||
    !telefone || !phonePattern.test(telefone) ||
    !mensagem || mensagem.length < 5 ||
    typeof tipoInteresse !== "string" ||
    !interestTypes.has(tipoInteresse)
  ) {
    throw new Error("invalid_input");
  }

  const empreendimentoId = cleanText(input.empreendimento_id, 36);
  if (
    empreendimentoId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      empreendimentoId,
    )
  ) {
    throw new Error("invalid_input");
  }

  const lead: Record<string, unknown> = {
    nome,
    email,
    telefone,
    mensagem,
    tipo_interesse: tipoInteresse,
    empreendimento_id: empreendimentoId,
    landing_page: cleanUrl(input.landing_page),
    referrer: cleanUrl(input.referrer),
  };
  for (const field of trackingFields) lead[field] = cleanText(input[field], 200);
  return lead;
}

async function hashIp(ip: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(ip),
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin") ?? "";
  const allowedOrigins = (Deno.env.get("LEAD_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!allowedOrigins.includes(origin)) {
    return new Response("Forbidden", { status: 403, headers: { Vary: "Origin" } });
  }
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: { ...corsHeaders, "Access-Control-Allow-Origin": origin },
    });
  }
  if (request.method !== "POST") {
    return response(405, { success: false, error: "Método não permitido." }, origin);
  }

  const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY");
  const rateSecret = Deno.env.get("LEAD_RATE_LIMIT_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!turnstileSecret || !rateSecret || !supabaseUrl || !serviceRoleKey) {
    console.error("submit-lead: required server secrets are not configured");
    return response(503, { success: false, error: "O envio está temporariamente indisponível." }, origin);
  }

  try {
    const rawBody = await request.text();
    if (rawBody.length > 12_000) {
      return response(413, { success: false, error: "Mensagem muito grande." }, origin);
    }

    const body = JSON.parse(rawBody) as Record<string, unknown>;
    if (typeof body.honeypot === "string" && body.honeypot.trim()) {
      return response(400, { success: false, error: "Não foi possível enviar a mensagem." }, origin);
    }
    if (
      typeof body.turnstileToken !== "string" ||
      body.turnstileToken.length < 1 ||
      body.turnstileToken.length > 2048
    ) {
      return response(400, { success: false, error: "Conclua a verificação de segurança." }, origin);
    }

    const ipAddress = request.headers.get("cf-connecting-ip");
    if (!ipAddress || ipAddress.length > 128) {
      console.error("submit-lead: trusted client address header is unavailable");
      return response(503, { success: false, error: "O envio está temporariamente indisponível." }, origin);
    }

    const captchaResponse = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: turnstileSecret,
        response: body.turnstileToken,
        remoteip: ipAddress,
      }),
    });
    if (!captchaResponse.ok) {
      console.error("submit-lead: Turnstile verification request failed");
      return response(503, { success: false, error: "Não foi possível validar a verificação de segurança." }, origin);
    }
    const captcha = await captchaResponse.json();
    const allowedHosts = allowedOrigins.map((item) => new URL(item).hostname);
    if (!captcha.success || !allowedHosts.includes(captcha.hostname)) {
      return response(400, { success: false, error: "A verificação de segurança expirou. Tente novamente." }, origin);
    }

    const lead = validateLead(body.lead);
    const client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const ipHash = await hashIp(ipAddress, rateSecret);
    const { data: permitted, error: rateError } = await client.rpc(
      "consume_public_lead_rate_limit",
      { p_ip_hash: ipHash },
    );
    if (rateError) {
      console.error("submit-lead: rate limit check failed", rateError.code);
      return response(503, { success: false, error: "O envio está temporariamente indisponível." }, origin);
    }
    if (!permitted) {
      return response(429, { success: false, error: "Muitas tentativas. Aguarde alguns minutos." }, origin);
    }

    if (lead.empreendimento_id) {
      const { data: property, error: propertyError } = await client
        .from("empreendimentos")
        .select("id")
        .eq("id", lead.empreendimento_id)
        .eq("status", "publicado")
        .maybeSingle();
      if (propertyError) {
        console.error("submit-lead: property lookup failed", propertyError.code);
        return response(503, { success: false, error: "O envio está temporariamente indisponível." }, origin);
      }
      if (!property) {
        return response(400, { success: false, error: "O empreendimento selecionado não está disponível." }, origin);
      }
    }

    const { error: insertError } = await client.from("leads").insert(lead);
    if (insertError) {
      console.error("submit-lead: database insert failed", insertError.code);
      return response(503, { success: false, error: "Não foi possível enviar sua mensagem. Tente novamente." }, origin);
    }

    return response(200, { success: true }, origin);
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && error.message === "invalid_input")) {
      return response(400, { success: false, error: "Confira os dados informados e tente novamente." }, origin);
    }
    console.error("submit-lead: request processing failed", error instanceof Error ? error.name : "UnknownError");
    return response(500, { success: false, error: "Não foi possível enviar sua mensagem. Tente novamente." }, origin);
  }
});
