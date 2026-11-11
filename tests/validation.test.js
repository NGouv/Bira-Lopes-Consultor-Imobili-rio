import assert from "node:assert/strict";
import test from "node:test";
import {
  getYouTubeEmbedUrl,
  MAX_IMAGE_SIZE_BYTES,
  validateImageFile,
  validateLead,
  validateProperty,
  validatePropertySlug,
  slugifyPropertyTitle,
  ValidationError,
} from "../src/services/validation.js";

const validLead = {
  nome: "Pessoa de Teste",
  email: "teste@example.com",
  telefone: "+55 (98) 99999-1234",
  mensagem: "Tenho interesse em conhecer as opções.",
  tipo_interesse: "comprar",
  utm_source: "campanha",
  landing_page: "https://example.com/imovel?utm_source=campanha",
};

test("validates and normalizes lead data without accepting extra fields", () => {
  const lead = validateLead({ ...validLead, internal_role: "admin" });

  assert.equal(lead.nome, "Pessoa de Teste");
  assert.equal(lead.utm_source, "campanha");
  assert.equal(lead.landing_page, validLead.landing_page);
  assert.equal("internal_role" in lead, false);
});

test("rejects malformed or incomplete lead data", () => {
  assert.throws(
    () => validateLead({ ...validLead, tipo_interesse: "admin" }),
    ValidationError,
  );
  assert.throws(
    () => validateLead({ ...validLead, landing_page: "javascript:alert(1)" }),
    ValidationError,
  );
  assert.throws(() => validateLead({ ...validLead, telefone: "telefone" }), ValidationError);
});

test("validates image MIME types and size limits", () => {
  assert.equal(
    validateImageFile({ type: "image/webp", size: MAX_IMAGE_SIZE_BYTES }),
    "webp",
  );
  assert.throws(
    () => validateImageFile({ type: "image/svg+xml", size: 100 }),
    ValidationError,
  );
  assert.throws(
    () => validateImageFile({ type: "image/jpeg", size: MAX_IMAGE_SIZE_BYTES + 1 }),
    ValidationError,
  );
});

test("accepts only safe YouTube video URLs and returns privacy-enhanced embed URLs", () => {
  assert.equal(
    getYouTubeEmbedUrl("https://youtu.be/abcdefghijk"),
    "https://www.youtube-nocookie.com/embed/abcdefghijk",
  );
  assert.equal(
    getYouTubeEmbedUrl("https://www.youtube.com/watch?v=abcdefghijk"),
    "https://www.youtube-nocookie.com/embed/abcdefghijk",
  );
  assert.throws(
    () => getYouTubeEmbedUrl("https://youtube.com.evil.example/embed/abcdefghijk"),
    ValidationError,
  );
  assert.throws(
    () => getYouTubeEmbedUrl("http://youtube.com/watch?v=abcdefghijk"),
    ValidationError,
  );
});

test("accepts only URL-safe property slugs", () => {
  assert.equal(validatePropertySlug("apartamento-no-calhau"), "apartamento-no-calhau");
  assert.throws(() => validatePropertySlug("../admin"), ValidationError);
  assert.equal(slugifyPropertyTitle("Apartamento no Calhau - São Luís"), "apartamento-no-calhau-sao-luis");
});

test("validates property data, normalizes YouTube URLs, and rejects invalid values", () => {
  const validProperty = {
    titulo: "Apartamento de teste",
    slug: "apartamento-de-teste",
    descricao: "Descrição válida para um empreendimento de teste.",
    tipo: "Apartamento",
    status: "rascunho",
    metragem: "120.5",
    quartos: "3",
    banheiros: "2",
    vagas: "1",
    preco: "500000",
    destaque: false,
    descricao_seo: "",
    video_url: "https://youtu.be/abcdefghijk?feature=share",
    video_ativo: true,
  };
  for (const finalidade of ["venda", "aluguel", "lancamento"]) {
    const property = validateProperty({ ...validProperty, finalidade });
    assert.equal(property.finalidade, finalidade);
  }

  const property = validateProperty({ ...validProperty, finalidade: "venda" });
  assert.equal(property.metragem, 120.5);
  assert.equal(property.quartos, 3);
  assert.equal(property.video_url, "https://www.youtube.com/embed/abcdefghijk");

  assert.throws(
    () => validateProperty({
      titulo: "Imóvel de teste",
      slug: "imovel-de-teste",
      descricao: "Descrição válida com tamanho suficiente.",
      tipo: "Casa",
      finalidade: "invalid",
      status: "publicado",
      destaque: false,
      video_url: "https://youtube.com.evil.example/watch?v=abcdefghijk",
      video_ativo: false,
    }),
    ValidationError,
  );
});
