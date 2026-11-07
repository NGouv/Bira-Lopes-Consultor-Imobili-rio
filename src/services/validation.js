const INTEREST_TYPES = new Set(["comprar", "investir", "empreendimento"]);
const IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
]);
export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_TRACKING_LENGTH = 200;

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

function optionalText(value, field, maxLength) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") {
    throw new ValidationError(`${field} deve ser um texto.`);
  }

  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new ValidationError(`${field} excede o limite permitido.`);
  }
  return normalized || null;
}

function optionalUrl(value, field) {
  const normalized = optionalText(value, field, 2048);
  if (!normalized) return null;

  let url;
  try {
    url = new URL(normalized);
  } catch {
    throw new ValidationError(`${field} precisa ser uma URL válida.`);
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new ValidationError(`${field} precisa usar HTTP ou HTTPS.`);
  }
  return url.href;
}

export function validateLead(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ValidationError("Os dados do contato são inválidos.");
  }

  const nome = optionalText(input.nome, "Nome", 120);
  const email = optionalText(input.email, "E-mail", 254);
  const telefone = optionalText(input.telefone, "Telefone", 24);
  const mensagem = optionalText(input.mensagem, "Mensagem", 2000);

  if (!nome || nome.length < 2) {
    throw new ValidationError("Informe seu nome.");
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ValidationError("Informe um e-mail válido.");
  }
  if (!telefone || !/^[+()0-9 .-]{8,24}$/.test(telefone)) {
    throw new ValidationError("Informe um telefone válido.");
  }
  if (!mensagem || mensagem.length < 5) {
    throw new ValidationError("A mensagem deve ter ao menos 5 caracteres.");
  }
  if (!INTEREST_TYPES.has(input.tipo_interesse)) {
    throw new ValidationError("Selecione um tipo de interesse válido.");
  }

  const empreendimentoId = optionalText(
    input.empreendimento_id,
    "Empreendimento",
    36,
  );
  if (
    empreendimentoId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      empreendimentoId,
    )
  ) {
    throw new ValidationError("O empreendimento selecionado é inválido.");
  }

  const tracking = {};
  for (const field of [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
  ]) {
    tracking[field] = optionalText(input[field], field, MAX_TRACKING_LENGTH);
  }

  return {
    nome,
    email,
    telefone,
    mensagem,
    tipo_interesse: input.tipo_interesse,
    empreendimento_id: empreendimentoId,
    ...tracking,
    landing_page: optionalUrl(input.landing_page, "Página de origem"),
    referrer: optionalUrl(input.referrer, "Referenciador"),
  };
}

export function validateImageFile(file) {
  if (!file || typeof file !== "object") {
    throw new ValidationError("Selecione um arquivo de imagem.");
  }
  if (!IMAGE_TYPES.has(file.type)) {
    throw new ValidationError("Formato de imagem não permitido.");
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw new ValidationError("O arquivo de imagem está vazio ou é inválido.");
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new ValidationError("Cada imagem pode ter no máximo 10 MB.");
  }
  return IMAGE_TYPES.get(file.type);
}

export function validatePropertySlug(slug) {
  if (
    typeof slug !== "string" ||
    slug.length < 2 ||
    slug.length > 160 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
  ) {
    throw new ValidationError("O slug do empreendimento é inválido.");
  }
  return slug;
}

export function slugifyPropertyTitle(value) {
  if (typeof value !== "string") {
    throw new ValidationError("Informe o título do empreendimento.");
  }
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 160)
    .replace(/-+$/g, "");

  return validatePropertySlug(slug);
}

function nullableNumber(
  value,
  field,
  { integer = false, min = 0, max = Number.MAX_SAFE_INTEGER } = {},
) {
  if (value === "" || value == null) return null;
  const number = Number(value);
  if (
    !Number.isFinite(number) ||
    number < min ||
    number > max ||
    (integer && !Number.isInteger(number))
  ) {
    throw new ValidationError(`${field} tem um valor inválido.`);
  }
  return number;
}

export function validateProperty(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ValidationError("Os dados do empreendimento são inválidos.");
  }

  const fields = [
    ["titulo", "Título", 2, 180],
    ["descricao", "Descrição", 10, 12000],
    ["tipo", "Tipo de imóvel", 2, 80],
  ];
  const result = {};
  for (const [key, label, min, max] of fields) {
    const value = optionalText(input[key], label, max);
    if (!value || value.length < min) {
      throw new ValidationError(`${label} deve ter ao menos ${min} caracteres.`);
    }
    result[key] = value;
  }

  result.slug = validatePropertySlug(input.slug);
  if (!["venda", "aluguel", "lancamento"].includes(input.finalidade)) {
    throw new ValidationError("Selecione uma finalidade válida.");
  }
  if (!["rascunho", "publicado", "arquivado"].includes(input.status)) {
    throw new ValidationError("Selecione um status válido.");
  }

  for (const key of ["endereco", "bairro", "cidade"]) {
    result[key] = optionalText(
      input[key],
      { endereco: "Endereço", bairro: "Bairro", cidade: "Cidade" }[key],
      { endereco: 240, bairro: 120, cidade: 120 }[key],
    );
  }

  const estado = optionalText(input.estado, "Estado", 2);
  if (estado && !/^[A-Z]{2}$/.test(estado)) {
    throw new ValidationError("Informe a sigla do estado com duas letras maiúsculas.");
  }
  result.estado = estado;
  result.metragem = nullableNumber(input.metragem, "Metragem", {
    min: Number.MIN_VALUE,
    max: 99_999_999.99,
  });
  result.quartos = nullableNumber(input.quartos, "Quartos", {
    integer: true,
    max: 32767,
  });
  result.banheiros = nullableNumber(input.banheiros, "Banheiros", {
    integer: true,
    max: 32767,
  });
  result.vagas = nullableNumber(input.vagas, "Vagas", {
    integer: true,
    max: 32767,
  });
  result.preco = nullableNumber(input.preco, "Preço", { max: 999_999_999_999.99 });
  if (typeof input.destaque !== "boolean") {
    throw new ValidationError("O campo de destaque é inválido.");
  }
  result.destaque = input.destaque;

  result.descricao_seo = optionalText(input.descricao_seo, "Descrição SEO", 320);
  result.video_url = optionalText(input.video_url, "Link do YouTube", 2048);
  if (result.video_url) {
    result.video_url = getYouTubeEmbedUrl(result.video_url).replace(
      "youtube-nocookie.com/embed/",
      "youtube.com/embed/",
    );
  }
  if (typeof input.video_ativo !== "boolean") {
    throw new ValidationError("O status do vídeo é inválido.");
  }
  if (input.video_ativo && !result.video_url) {
    throw new ValidationError("Informe um vídeo antes de ativar sua exibição.");
  }
  result.video_ativo = input.video_ativo;

  return result;
}

export function getYouTubeEmbedUrl(value) {
  if (typeof value !== "string" || value.length > 2048) {
    throw new ValidationError("Informe uma URL válida do YouTube.");
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ValidationError("Informe uma URL válida do YouTube.");
  }

  if (url.protocol !== "https:") {
    throw new ValidationError("A URL do vídeo precisa usar HTTPS.");
  }

  const host = url.hostname.toLowerCase();
  let videoId = null;
  if (host === "youtu.be") {
    videoId = url.pathname.slice(1);
  } else if (host === "youtube.com" || host === "www.youtube.com") {
    if (url.pathname === "/watch") {
      videoId = url.searchParams.get("v");
    } else {
      videoId = url.pathname.match(/^\/(?:embed|shorts)\/([A-Za-z0-9_-]{11})\/?$/)?.[1];
    }
  }

  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    throw new ValidationError("A URL não corresponde a um vídeo válido do YouTube.");
  }

  return `https://www.youtube-nocookie.com/embed/${videoId}`;
}
