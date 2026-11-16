import { getPublishedProperties, getPublishedPropertyBySlug } from "./services/propertyService.js";
import { createImageSignedUrls } from "./services/storageService.js";
import { submitLead } from "./services/leadService.js";
import {
  getInstagramReelEmbedUrl,
  getYouTubeEmbedUrl,
} from "./services/validation.js";

const WHATSAPP_PHONE = "559888659130";
const PAGE_SIZE = 9;
const propertyTrack = document.querySelector("#property-track");
const detailContent = document.querySelector("#property-detail-content");
const menuToggle = document.querySelector(".menu-toggle");
const navigation = document.querySelector("#navegacao");
let activeProperty = null;
let activeImageIndex = 0;
let catalogPage = 1;
let catalogCount = 0;
let catalogLoading = false;
let turnstileWidgetId = null;
let turnstileToken = "";

function node(tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (value != null) element.textContent = value;
  return element;
}

function locationLabel(property) {
  return [property.bairro, property.cidade, property.estado].filter(Boolean).join(", ");
}

function formatPrice(value, purpose) {
  if (value == null) return "Consulte valores";
  const formatted = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(Number(value));
  if (purpose === "aluguel") return `${formatted}/mês`;
  if (purpose === "lancamento") return `A partir de ${formatted}`;
  return formatted;
}

function purposeLabel(purpose) {
  return {
    venda: "Venda",
    aluguel: "Aluguel",
    lancamento: "Lançamento",
  }[purpose] || purpose;
}

function propertyIcon(name) {
  const paths = {
    area: ["M4 4h16v16H4z", "M9 4v4", "M15 4v4", "M4 10h4", "M4 16h4"],
    bedrooms: ["M3 19V5", "M3 15h18v4", "M7 15V9h5a3 3 0 0 1 3 3v3", "M15 11h3a3 3 0 0 1 3 3v1"],
    bathrooms: ["M4 12h16v2a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-2Z", "M7 12V6a2 2 0 0 1 4 0v1"],
    parking: ["M5 17 6.5 9h11l1.5 8", "M4 17h16v3H4z", "M7 13h.01", "M17 13h.01", "M9 12h6a2 2 0 0 0 0-4h-3v8"],
  };
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("class", "property-feature-icon");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("fill", "none");
  icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-width", "1.5");
  icon.setAttribute("stroke-linecap", "round");
  icon.setAttribute("stroke-linejoin", "round");
  icon.setAttribute("aria-hidden", "true");
  for (const data of paths[name] || []) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", data);
    icon.append(path);
  }
  return icon;
}

function appendPropertyFeatures(container, property) {
  const features = [
    ["area", property.metragem != null && `${Number(property.metragem).toLocaleString("pt-BR")} m²`, "Metragem"],
    ["bedrooms", property.quartos, "Quartos"],
    ["bathrooms", property.banheiros, "Banheiros"],
    ["parking", property.vagas, "Vagas"],
  ].filter(([, value]) => value != null && value !== "");

  if (!features.length) return;
  const list = node("ul", "property-card-features");
  for (const [iconName, value, label] of features) {
    const item = node("li");
    item.append(propertyIcon(iconName), node("span", "", String(value)), node("span", "property-feature-label", label));
    list.append(item);
  }
  container.append(list);
}

function setCatalogStatus(message, state = "") {
  const status = document.querySelector("#catalog-status");
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
}

function propertyCard(property, coverUrl) {
  const article = node("article", "property-card");
  const link = node("a", "property-card-link");
  link.href = `imovel.html?slug=${encodeURIComponent(property.slug)}`;
  link.setAttribute("aria-label", `Ver imóvel: ${property.titulo}`);

  const photoWrap = node("div", "property-photo-wrap");
  if (coverUrl) {
    const image = node("img", "property-photo");
    image.src = coverUrl;
    image.alt = property.titulo;
    image.loading = "lazy";
    image.decoding = "async";
    photoWrap.append(image);
  } else {
    photoWrap.append(node("span", "property-photo-placeholder", "Imagem não cadastrada"));
  }
  const tags = node("div", "property-tags");
  tags.append(node("span", "property-tag", purposeLabel(property.finalidade)));
  if (property.destaque) tags.append(node("span", "property-tag property-tag-featured", "Destaque"));
  photoWrap.append(tags);

  const copy = node("div", "property-copy");
  copy.append(node("p", "property-location", locationLabel(property) || "São Luís, MA"));
  copy.append(node("h3", "", property.titulo));
  const description = node("p", "property-card-description", property.descricao);
  copy.append(description);
  appendPropertyFeatures(copy, property);

  link.append(photoWrap, copy);
  const bottom = node("div", "property-bottom");
  const price = node("div");
  price.append(
    node("span", "property-price-label", property.finalidade === "aluguel" ? "Valor mensal" : property.finalidade === "lancamento" ? "Valores" : "Valor"),
    node("strong", "property-price", formatPrice(property.preco, property.finalidade)),
  );
  const action = node("a", "property-action", "Ver imóvel");
  action.href = link.href;
  action.setAttribute("aria-label", `Ver imóvel: ${property.titulo}`);
  bottom.append(price, action);
  article.append(link, bottom);
  return article;
}

async function loadCatalog(page = catalogPage) {
  if (!propertyTrack || catalogLoading) return;
  catalogLoading = true;
  propertyTrack.replaceChildren();
  setCatalogStatus("Carregando empreendimentos...", "loading");
  const pagination = document.querySelector("#catalog-pagination");
  if (pagination) pagination.hidden = true;

  try {
    const result = await getPublishedProperties({ page, pageSize: PAGE_SIZE });
    catalogPage = result.page;
    catalogCount = result.count;
    propertyTrack.dataset.cardCount = String(result.data.length);

    const covers = result.data
      .filter((property) => property.cover_storage_path)
      .map((property) => property.cover_storage_path);
    const signed = await createImageSignedUrls(covers);
    const signedByPath = new Map(signed.map((item) => [item.path, item.signedUrl]));

    for (const property of result.data) {
      propertyTrack.append(
        propertyCard(
          property,
          property.cover_storage_path
            ? signedByPath.get(property.cover_storage_path)
            : null,
        ),
      );
    }
    if (result.data.length === 0) {
      setCatalogStatus(
        page > 1
          ? "Não há mais empreendimentos nesta página."
          : "No momento, não há empreendimentos publicados.",
      );
    } else {
      setCatalogStatus("");
    }

    if (pagination) {
      pagination.hidden = result.count <= result.pageSize;
      const label = document.querySelector("#catalog-page-label");
      if (label) {
        label.textContent = `Página ${result.page} de ${Math.max(1, Math.ceil(result.count / result.pageSize))}`;
      }
      const previous = pagination.querySelector('[data-page-step="-1"]');
      const next = pagination.querySelector('[data-page-step="1"]');
      if (previous) previous.disabled = result.page === 1;
      if (next) next.disabled = result.page * result.pageSize >= result.count;
    }
  } catch (error) {
    console.error("Falha ao carregar o catálogo:", error);

    const message = error?.message || "Erro desconhecido ao consultar o catálogo.";
    const isConfigIssue = /Supabase não configurado|VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY/i.test(message);
    const isProjectIssue = /PGRST205|Could not find the table|schema cache|not found/i.test(message);

    setCatalogStatus(
      isConfigIssue
        ? "O catálogo está sem configuração do Supabase no ambiente atual. Verifique VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no deploy."
        : isProjectIssue
          ? "Não foi possível acessar o projeto Supabase correto ou a tabela de imóveis não está disponível. Verifique a URL do projeto e o schema do banco."
          : "Não foi possível carregar os empreendimentos. Tente novamente em instantes.",
      "error",
    );
    const retry = node("button", "button button-dark", "Tentar novamente");
    retry.type = "button";
    retry.addEventListener("click", () => loadCatalog(page));
    propertyTrack.append(retry);
  } finally {
    catalogLoading = false;
  }
}

function createWhatsAppLink(message) {
  return `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(message)}`;
}

function propertyMessage(property) {
  return `Olá, Bira! Tenho interesse em ${property.titulo} (${locationLabel(property) || "São Luís"}).`;
}

function appendDetailFeatures(container, property) {
  const features = [
    ["area", property.metragem != null && `${Number(property.metragem).toLocaleString("pt-BR")} m²`, "Metragem"],
    ["bedrooms", property.quartos, "Quartos"],
    ["bathrooms", property.banheiros, "Banheiros"],
    ["parking", property.vagas, "Vagas"],
  ].filter(([, value]) => value != null && value !== "");

  if (!features.length) return;
  const list = node("ul", "detail-features");
  for (const [iconName, value, label] of features) {
    const item = node("li", "detail-feature");
    item.append(
      propertyIcon(iconName),
      node("strong", "", String(value)),
      node("span", "", label),
    );
    list.append(item);
  }
  container.append(list);
}

async function showPropertyDetail() {
  if (!detailContent) return;

  detailContent.replaceChildren(node("p", "catalog-status", "Carregando empreendimento..."));
  const slug = new URLSearchParams(window.location.search).get("slug");
  if (!slug) {
    renderPropertyNotFound("Este endereço não identifica um empreendimento.");
    return;
  }

  try {
    activeProperty = await getPublishedPropertyBySlug(slug);
    if (!activeProperty) {
      renderPropertyNotFound("Este empreendimento não existe ou não está publicado.");
      return;
    }

    const paths = (activeProperty.empreendimento_imagens ?? [])
      .sort((a, b) => a.ordem - b.ordem)
      .map((image) => image.storage_path);
    const signed = await createImageSignedUrls(paths);
    const signedByPath = new Map(signed.map((item) => [item.path, item.signedUrl]));
    const galleryImages = (activeProperty.empreendimento_imagens ?? [])
      .sort((a, b) => a.ordem - b.ordem)
      .map((image) => ({ ...image, url: signedByPath.get(image.storage_path) }));
    activeProperty.gallery = galleryImages;
    activeImageIndex = Math.max(
      0,
      galleryImages.findIndex((image) => image.is_cover),
    );

    document.title = `${activeProperty.titulo} | Bira Lopes`;
    const description = document.querySelector('meta[name="description"]');
    if (description) {
      description.content =
        activeProperty.descricao_seo ||
        `${activeProperty.titulo} em ${locationLabel(activeProperty) || "São Luís, MA"}. Conheça mais com Bira Lopes.`;
    }

    renderPropertyDetail();
  } catch (error) {
    console.error("Falha ao carregar o empreendimento:", error);
    const message = error?.message || "Erro desconhecido ao consultar o empreendimento.";
    const isConfigIssue = /Supabase não configurado|VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY/i.test(message);
    const isProjectIssue = /PGRST205|Could not find the table|schema cache|not found/i.test(message);
    detailContent.replaceChildren(
      node(
        "p",
        "catalog-status",
        isConfigIssue
          ? "Os detalhes deste empreendimento dependem do ambiente do Supabase. Verifique VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY antes do deploy."
          : isProjectIssue
            ? "O projeto Supabase conectado está inconsistente ou a tabela do catálogo não está disponível. Verifique o schema e a URL do projeto."
            : "Não foi possível carregar este empreendimento. Tente novamente em instantes.",
      ),
    );
    const retry = node("button", "button button-dark", "Tentar novamente");
    retry.type = "button";
    retry.addEventListener("click", showPropertyDetail);
    detailContent.append(retry);
  }
}

function renderPropertyNotFound(message) {
  const wrapper = node("div", "property-not-found");
  wrapper.append(
    node("p", "eyebrow", "Empreendimento indisponível"),
    node("h1", "", message),
  );
  const back = node("a", "button button-dark", "Voltar ao catálogo ↗");
  back.href = "index.html#imoveis";
  wrapper.append(back);
  detailContent.replaceChildren(wrapper);
}

function renderPropertyDetail() {
  const breadcrumb = node("nav", "property-breadcrumb");
  breadcrumb.setAttribute("aria-label", "Trilha de navegação");
  const catalogCrumb = node("a", "", "Imóveis");
  catalogCrumb.href = "index.html#imoveis";
  const cityCrumb = node("a", "", "São Luís");
  cityCrumb.href = "index.html#bairros";
  breadcrumb.append(
    catalogCrumb,
    node("span", "", "›"),
    cityCrumb,
    node("span", "", "›"),
    node("span", "property-breadcrumb-current", activeProperty.titulo),
  );

  const heading = node("header", "detail-heading");
  const labels = node("div", "detail-labels");
  labels.append(
    node("span", "sample-label", activeProperty.tipo),
    node("span", "detail-purpose", purposeLabel(activeProperty.finalidade)),
  );
  heading.append(
    labels,
    node("h1", "", activeProperty.titulo),
    node("p", "property-location", locationLabel(activeProperty) || "São Luís, MA"),
  );

  const layout = node("div", "detail-layout");
  const gallery = node("div", "detail-gallery");
  const images = activeProperty.gallery;
  if (images.length) {
    const image = node("img");
    image.alt = `${activeProperty.titulo} — imagem ${activeImageIndex + 1}`;
    image.loading = "eager";
    image.src = images[activeImageIndex].url;
    const mainImage = node("div", "detail-gallery-main");
    mainImage.append(image);
    if (images.length > 1) {
      const controls = node("div", "gallery-controls");
      const previous = node("button", "", "←");
      previous.type = "button";
      previous.setAttribute("aria-label", "Imagem anterior");
      previous.addEventListener("click", () => changeGallery(-1));
      const count = node("span", "gallery-count", `${activeImageIndex + 1} / ${images.length}`);
      count.id = "gallery-count";
      const next = node("button", "", "→");
      next.type = "button";
      next.setAttribute("aria-label", "Próxima imagem");
      next.addEventListener("click", () => changeGallery(1));
      controls.append(previous, count, next);
      mainImage.append(controls);
    }
    gallery.append(mainImage);
    if (images.length > 1) {
      const thumbnails = node("div", "detail-thumbnails");
      thumbnails.setAttribute("aria-label", "Miniaturas da galeria");
      images.forEach((galleryImage, index) => {
        const thumbnail = node("button", "detail-thumbnail");
        thumbnail.type = "button";
        thumbnail.setAttribute("aria-label", `Exibir imagem ${index + 1} de ${images.length}`);
        thumbnail.setAttribute("aria-pressed", String(index === activeImageIndex));
        const thumbnailImage = node("img");
        thumbnailImage.src = galleryImage.url;
        thumbnailImage.alt = "";
        thumbnailImage.loading = "lazy";
        thumbnail.append(thumbnailImage);
        thumbnail.addEventListener("click", () => setGalleryImage(index));
        thumbnails.append(thumbnail);
      });
      gallery.append(thumbnails);
    }
  } else {
    gallery.classList.add("detail-gallery-empty");
    gallery.append(node("span", "property-photo-placeholder", "Imagens ainda não cadastradas"));
  }

  const copy = node("div", "detail-copy");
  appendDetailFeatures(copy, activeProperty);
  const price = node("div", "detail-price");
  price.append(
    node("span", "property-price-label", activeProperty.finalidade === "aluguel" ? "Valor mensal" : activeProperty.finalidade === "lancamento" ? "Investimento" : "Valor"),
    node("strong", "property-price", formatPrice(activeProperty.preco, activeProperty.finalidade)),
  );
  if (
    activeProperty.finalidade === "venda" &&
    Number(activeProperty.preco) > 0 &&
    Number(activeProperty.metragem) > 0
  ) {
    const pricePerMeter = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    }).format(Number(activeProperty.preco) / Number(activeProperty.metragem));
    price.append(node("span", "detail-price-per-meter", `${pricePerMeter} / m²`));
  }
  const contact = node("a", "button button-dark", "Tenho interesse ↗");
  contact.href = createWhatsAppLink(propertyMessage(activeProperty));
  contact.target = "_blank";
  contact.rel = "noopener noreferrer";
  contact.dataset.analyticsPosition = "property_detail";
  const formContact = node("a", "property-form-contact", "Prefiro enviar uma mensagem pelo formulário");
  formContact.href = `index.html?empreendimento=${encodeURIComponent(activeProperty.id)}#contato`;
  copy.append(price, contact, formContact);
  layout.append(gallery, copy);

  const about = node("section", "detail-about");
  about.append(
    node("p", "eyebrow", "Detalhes"),
    node("h2", "", "Sobre o imóvel"),
    node("p", "detail-description", activeProperty.descricao),
  );

  const mediaSection = node("section", "property-video-section");
  if (
    (activeProperty.video_ativo && activeProperty.video_url) ||
    activeProperty.reel_url
  ) {
    mediaSection.append(node("h2", "", "Conheça o empreendimento"));
    if (activeProperty.video_ativo && activeProperty.video_url) {
      try {
        const video = node("iframe", "property-video");
        video.src = getYouTubeEmbedUrl(activeProperty.video_url);
        video.title = `Vídeo: ${activeProperty.titulo}`;
        video.loading = "lazy";
        video.referrerPolicy = "strict-origin-when-cross-origin";
        video.allow =
          "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
        video.allowFullscreen = true;
        mediaSection.append(video);
      } catch (error) {
        console.error("URL de vídeo inválida no cadastro:", error);
      }
    }
    if (activeProperty.reel_url) {
      try {
        const reel = node("iframe", "property-video property-video-instagram");
        reel.src = getInstagramReelEmbedUrl(activeProperty.reel_url);
        reel.title = `Reel do Instagram: ${activeProperty.titulo}`;
        reel.loading = "lazy";
        reel.referrerPolicy = "strict-origin-when-cross-origin";
        mediaSection.append(reel);
      } catch (error) {
        console.error("URL de Reel inválida no cadastro:", error);
      }
    }
  }

  detailContent.replaceChildren(breadcrumb, heading, layout, about);
  if (mediaSection.childElementCount > 1) detailContent.append(mediaSection);
}

function setGalleryImage(index) {
  if (!activeProperty?.gallery?.length) return;
  activeImageIndex = index;
  const image = detailContent.querySelector(".detail-gallery-main > img");
  const count = detailContent.querySelector("#gallery-count");
  if (image) {
    image.src = activeProperty.gallery[activeImageIndex].url;
    image.alt = `${activeProperty.titulo} — imagem ${activeImageIndex + 1}`;
  }
  if (count) count.textContent = `${activeImageIndex + 1} / ${activeProperty.gallery.length}`;
  detailContent.querySelectorAll(".detail-thumbnail").forEach((thumbnail, thumbnailIndex) => {
    const selected = thumbnailIndex === activeImageIndex;
    thumbnail.setAttribute("aria-pressed", String(selected));
    if (selected) thumbnail.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
}

function changeGallery(step) {
  if (!activeProperty?.gallery?.length) return;
  const images = activeProperty.gallery;
  setGalleryImage((activeImageIndex + step + images.length) % images.length);
}

function rememberAttribution() {
  const current = new URLSearchParams(window.location.search);
  const keys = ["utm_source", "utm_medium", "utm_campaign", "utm_content"];
  const attribution = {};
  for (const key of keys) {
    attribution[key] = current.get(key) || "";
  }

  try {
    const saved = JSON.parse(sessionStorage.getItem("bira-attribution") || "{}");
    for (const key of keys) {
      if (!attribution[key] && typeof saved[key] === "string") {
        attribution[key] = saved[key];
      }
    }
    attribution.landing_page =
      typeof saved.landing_page === "string" && saved.landing_page
        ? saved.landing_page
        : window.location.href;
    attribution.referrer =
      typeof saved.referrer === "string" ? saved.referrer : document.referrer || "";
    sessionStorage.setItem("bira-attribution", JSON.stringify(attribution));
  } catch (error) {
    console.warn("Não foi possível preservar os parâmetros de origem da visita.", error);
    attribution.landing_page = window.location.href;
    attribution.referrer = document.referrer || "";
  }
  return attribution;
}

function initializeTurnstile() {
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  const form = document.querySelector("#lead-form");
  const submit = document.querySelector("#lead-submit");
  const note = document.querySelector("#lead-form-note");
  if (!form || !submit || !note) return;
  if (!siteKey) {
    note.textContent =
      "O formulário aguarda configuração de segurança. Você ainda pode entrar em contato pelo WhatsApp.";
    return;
  }

  note.textContent = "Confirme a verificação de segurança para enviar sua mensagem.";
  const script = document.createElement("script");
  script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  script.async = true;
  script.defer = true;
  script.onload = () => {
    if (!window.turnstile) {
      note.textContent = "Não foi possível carregar a verificação. Tente novamente mais tarde.";
      return;
    }
    turnstileWidgetId = window.turnstile.render("#turnstile-container", {
      sitekey: siteKey,
      callback: (token) => {
        turnstileToken = token;
        submit.disabled = false;
      },
      "expired-callback": () => {
        turnstileToken = "";
        submit.disabled = true;
      },
      "error-callback": () => {
        turnstileToken = "";
        submit.disabled = true;
        note.textContent = "Verificação indisponível. Tente novamente.";
      },
    });
  };
  script.onerror = () => {
    note.textContent = "Não foi possível carregar a verificação de segurança.";
  };
  document.head.append(script);
}

function initializeLeadForm() {
  const form = document.querySelector("#lead-form");
  const submitButton = document.querySelector("#lead-submit");
  const status = document.querySelector("#lead-form-status");
  if (!form || !submitButton || !status) return;

  rememberAttribution();
  const selectedProperty = new URLSearchParams(window.location.search).get("empreendimento");
  if (selectedProperty) {
    form.elements.namedItem("empreendimento_id").value = selectedProperty;
    form.elements.namedItem("tipo_interesse").value = "empreendimento";
  }
  initializeTurnstile();
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    if (!turnstileToken) {
      status.textContent = "Conclua a verificação de segurança antes de enviar.";
      return;
    }

    const values = new FormData(form);
    const attribution = rememberAttribution();
    const lead = {
      nome: values.get("nome"),
      telefone: values.get("telefone"),
      email: values.get("email"),
      tipo_interesse: values.get("tipo_interesse"),
      mensagem: values.get("mensagem"),
      empreendimento_id: values.get("empreendimento_id") || null,
      ...attribution,
      landing_page: attribution.landing_page,
      referrer: attribution.referrer || null,
    };

    submitButton.disabled = true;
    status.textContent = "Enviando sua mensagem...";
    try {
      await submitLead(lead, turnstileToken, values.get("website"));
      try {
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({ event: "generate_lead", form_id: "lead-form" });
      } catch (error) {
        console.error("Falha ao registrar conversão de lead:", error);
      }
      form.reset();
      status.textContent = "Mensagem enviada. Obrigado pelo contato!";
      if (window.turnstile && turnstileWidgetId != null) {
        window.turnstile.reset(turnstileWidgetId);
      }
      turnstileToken = "";
    } catch (error) {
      console.error("Falha ao enviar mensagem de contato:", error);
      status.textContent =
        error?.message || "Não foi possível enviar. Seus dados continuam no formulário.";
      if (window.turnstile && turnstileWidgetId != null) {
        window.turnstile.reset(turnstileWidgetId);
      }
      turnstileToken = "";
    } finally {
      submitButton.disabled = !turnstileToken;
    }
  });
}

if (propertyTrack) loadCatalog();
if (detailContent) showPropertyDetail();
rememberAttribution();
initializeLeadForm();

window.addEventListener(
  "scroll",
  () => {
    const header = document.querySelector(".site-header");
    if (header) header.classList.toggle("is-scrolled", window.scrollY > 24);
  },
  { passive: true },
);

if (menuToggle && navigation) {
  const closeNavigation = () => {
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Abrir menu");
    navigation.classList.remove("is-open");
  };

  menuToggle.addEventListener("click", () => {
    const isExpanded = menuToggle.getAttribute("aria-expanded") === "true";
    if (isExpanded) {
      closeNavigation();
      return;
    }
    menuToggle.setAttribute("aria-expanded", "true");
    menuToggle.setAttribute("aria-label", "Fechar menu");
    navigation.classList.add("is-open");
  });

  navigation.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("a")) closeNavigation();
  });

  document.addEventListener("click", (event) => {
    if (
      menuToggle.getAttribute("aria-expanded") === "true" &&
      event.target instanceof Node &&
      !menuToggle.contains(event.target) &&
      !navigation.contains(event.target)
    ) {
      closeNavigation();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || menuToggle.getAttribute("aria-expanded") !== "true") return;
    closeNavigation();
    menuToggle.focus();
  });
}

document.addEventListener("click", (event) => {
  const pageButton = event.target.closest("[data-page-step]");
  if (pageButton && !catalogLoading) {
    const nextPage = catalogPage + Number(pageButton.dataset.pageStep);
    if (nextPage >= 1 && (nextPage - 1) * PAGE_SIZE < catalogCount) {
      loadCatalog(nextPage);
    }
    return;
  }

});

document.addEventListener("click", (event) => {
  const whatsappLink =
    event.target instanceof Element
      ? event.target.closest(".whatsapp-link, a[href*='wa.me/']")
      : null;
  if (!whatsappLink) return;

  const eventData = {
    event: "whatsapp_click",
    page_path: window.location.pathname,
    page_type: detailContent ? "property_detail" : "home",
    button_position: whatsappLink.dataset.analyticsPosition || "unspecified",
  };
  if (detailContent && activeProperty) {
    eventData.property_id = activeProperty.id;
    eventData.property_slug = activeProperty.slug;
  }
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(eventData);

  if (!whatsappLink.matches(".whatsapp-link")) return;
  event.preventDefault();
  window.open(
    createWhatsAppLink(
      whatsappLink.dataset.message ||
        "Olá, Bira! Gostaria de conversar sobre imóveis em São Luís.",
    ),
    "_blank",
    "noopener,noreferrer",
  );
});

const footerYear = document.querySelector("#footer-year");
if (footerYear) {
  const currentYear = new Date().getFullYear();
  footerYear.textContent = String(currentYear);
  footerYear.dateTime = String(currentYear);
}
