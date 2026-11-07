import { getSupabaseClient } from "../config/supabaseClient.js";
import { validatePropertySlug } from "./validation.js";

const PAGE_SIZE_DEFAULT = 9;
const PAGE_SIZE_MAX = 24;
const PROPERTY_COLUMNS = [
  "id",
  "titulo",
  "slug",
  "descricao",
  "tipo",
  "finalidade",
  "bairro",
  "cidade",
  "estado",
  "metragem",
  "quartos",
  "banheiros",
  "vagas",
  "preco",
  "destaque",
  "descricao_seo",
  "video_url",
  "video_ativo",
  "created_at",
].join(",");

export async function getPublishedProperties({ page = 1, pageSize = PAGE_SIZE_DEFAULT } = {}) {
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new RangeError("A página deve ser um inteiro positivo.");
  }
  if (
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > PAGE_SIZE_MAX
  ) {
    throw new RangeError(`O tamanho da página deve estar entre 1 e ${PAGE_SIZE_MAX}.`);
  }

  const client = getSupabaseClient();
  const from = (page - 1) * pageSize;
  const { data, error, count } = await client
    .from("empreendimentos")
    .select(PROPERTY_COLUMNS, { count: "exact" })
    .eq("status", "publicado")
    .order("destaque", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, from + pageSize - 1);

  if (error) throw error;

  if (data.length === 0) {
    return { data: [], count: count ?? 0, page, pageSize };
  }

  const propertyIds = data.map((property) => property.id);
  const { data: covers, error: coversError } = await client
    .from("empreendimento_imagens")
    .select("empreendimento_id,storage_path")
    .in("empreendimento_id", propertyIds)
    .eq("is_cover", true);

  if (coversError) throw coversError;

  const coverByProperty = new Map(
    covers.map((cover) => [cover.empreendimento_id, cover.storage_path]),
  );

  return {
    data: data.map((property) => ({
      ...property,
      cover_storage_path: coverByProperty.get(property.id) ?? null,
    })),
    count: count ?? 0,
    page,
    pageSize,
  };
}

export async function getPublishedPropertyBySlug(slug) {
  validatePropertySlug(slug);

  const { data, error } = await getSupabaseClient()
    .from("empreendimentos")
    .select(`${PROPERTY_COLUMNS},empreendimento_imagens(id,storage_path,ordem,is_cover)`)
    .eq("slug", slug)
    .eq("status", "publicado")
    .order("ordem", {
      ascending: true,
      referencedTable: "empreendimento_imagens",
    })
    .maybeSingle();

  if (error) throw error;
  return data;
}
