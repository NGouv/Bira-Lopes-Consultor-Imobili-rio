import { getSupabaseClient } from "../config/supabaseClient.js";
import { validateProperty } from "./validation.js";

const ADMIN_PAGE_SIZE = 25;

export async function getDashboardSummary({ includeLeads }) {
  const client = getSupabaseClient();
  const [published, drafts] = await Promise.all([
    client
      .from("empreendimentos")
      .select("id", { count: "exact", head: true })
      .eq("status", "publicado"),
    client
      .from("empreendimentos")
      .select("id", { count: "exact", head: true })
      .eq("status", "rascunho"),
  ]);
  if (published.error) throw published.error;
  if (drafts.error) throw drafts.error;

  if (!includeLeads) {
    return {
      published: published.count ?? 0,
      drafts: drafts.count ?? 0,
      leads: null,
      recentLeads: [],
    };
  }

  const [leads, recentLeads] = await Promise.all([
    client.from("leads").select("id", { count: "exact", head: true }),
    client
      .from("leads")
      .select(
        "id,nome,email,telefone,mensagem,tipo_interesse,empreendimento_id,utm_source,utm_medium,utm_campaign,utm_content,landing_page,referrer,status,created_at,empreendimentos(titulo,slug)",
      )
      .order("created_at", { ascending: false })
      .range(0, 9),
  ]);
  if (leads.error) throw leads.error;
  if (recentLeads.error) throw recentLeads.error;

  return {
    published: published.count ?? 0,
    drafts: drafts.count ?? 0,
    leads: leads.count ?? 0,
    recentLeads: recentLeads.data,
  };
}

export async function listManagedProperties({ page = 1 } = {}) {
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new RangeError("A página deve ser um inteiro positivo.");
  }

  const from = (page - 1) * ADMIN_PAGE_SIZE;
  const { data, error, count } = await getSupabaseClient()
    .from("empreendimentos")
    .select("id,titulo,slug,finalidade,status,bairro,cidade,preco,destaque,created_at", {
      count: "exact",
    })
    .order("updated_at", { ascending: false })
    .range(from, from + ADMIN_PAGE_SIZE - 1);
  if (error) throw error;

  return { data, count: count ?? 0, page, pageSize: ADMIN_PAGE_SIZE };
}

export async function getManagedProperty(id) {
  const { data, error } = await getSupabaseClient()
    .from("empreendimentos")
    .select("*,empreendimento_imagens(id,storage_path,ordem,is_cover,created_at)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveProperty(input, id = null) {
  const property = validateProperty(input);
  const client = getSupabaseClient();
  const query = id
    ? client.from("empreendimentos").update(property).eq("id", id)
    : client.from("empreendimentos").insert(property);
  const { data, error } = await query.select("id,slug,status").single();
  if (error) throw error;
  return data;
}

export async function updatePropertyStatus(id, status) {
  if (!["rascunho", "publicado", "arquivado"].includes(status)) {
    throw new TypeError("O status do empreendimento é inválido.");
  }
  const { error } = await getSupabaseClient()
    .from("empreendimentos")
    .update({ status })
    .eq("id", id);
  if (error) throw error;
}

export async function listLeads({ page = 1 } = {}) {
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new RangeError("A página deve ser um inteiro positivo.");
  }

  const from = (page - 1) * ADMIN_PAGE_SIZE;
  const { data, error, count } = await getSupabaseClient()
    .from("leads")
    .select(
      "id,nome,email,telefone,mensagem,tipo_interesse,empreendimento_id,utm_source,utm_medium,utm_campaign,utm_content,landing_page,referrer,status,created_at,empreendimentos(titulo,slug)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, from + ADMIN_PAGE_SIZE - 1);
  if (error) throw error;

  return { data, count: count ?? 0, page, pageSize: ADMIN_PAGE_SIZE };
}

export async function updateLeadStatus(id, status) {
  if (!["novo", "contatado", "qualificado", "convertido", "arquivado"].includes(status)) {
    throw new TypeError("O status do lead é inválido.");
  }
  const { error } = await getSupabaseClient()
    .from("leads")
    .update({ status })
    .eq("id", id);
  if (error) throw error;
}
