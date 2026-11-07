import { getPublishedProperties, getPublishedPropertyBySlug } from "./services/propertyService.js";
import { createImageSignedUrls } from "./services/storageService.js";
import { submitLead } from "./services/leadService.js";
import { getYouTubeEmbedUrl } from "./services/validation.js";

const WHATSAPP_PHONE = "559888659130";
const PAGE_SIZE = 6;
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
    maximumFractionDigits: 2,
  }).format(Number(value));
  return purpose === "aluguel" ? `${formatted}/mês` : formatted;
}

function featureLabel(property) {
  return [
    property.metragem != null && `${Number(property.metragem).toLocaleString("pt-BR")} m²`,
    property.quartos != null && `${property.quartos} quartos`,
    property.banheiros != null && `${property.banheiros} banheiros`,
    property.vagas != null && `${property.vagas} vagas`,
  ].filter(Boolean).join(" · ");
}

function setCatalogStatus(message, state = "") {
  const status = document.querySelector("#catalog-status");
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
}

function updateCarouselControls() {
  if (!propertyTrack) return;
  const previous = document.querySelector('[data-carousel-step="-1"]');
  const next = document.querySelector('[data-carousel-step="1"]');
  if (!previous || !next) return;
  previous.disabled = propertyTrack.scrollLeft <= 1;
  next.disabled =
    propertyTrack.scrollLeft + propertyTrack.clientWidth >= propertyTrack.scrollWidth - 1;
}

function propertyCard(property, coverUrl) {
  const article = node("article", "property-card");
  const link = node("a", "property-card-link");
  link.href = `imovel.html?slug=${encodeURIComponent(property.slug)}`;

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
  photoWrap.append(node("span", "property-tag", property.finalidade));

  const copy = node("div", "property-copy");
  copy.append(node("h3", "", property.titulo));
  copy.append(node("p", "property-location", locationLabel(property) || "São Luís, MA"));
  const features = featureLabel(property);
  if (features) copy.append(node("p", "property-features", features));
  const description = node("p", "property-card-description", property.descricao);
  copy.append(description);

  link.append(photoWrap, copy);
  const bottom = node("div", "property-bottom");
  const price = node("div");
  price.append(
    node("span", "property-price-label", property.finalidade === "aluguel" ? "Valor mensal" : "Valor"),
    node("strong", "property-price", formatPrice(property.preco, property.finalidade)),
  );
  const action = node("a", "property-action", "Conhecer empreendimento");
  action.href = link.href;
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
    requestAnimationFrame(updateCarouselControls);

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
    setCatalogStatus(
      error.message.includes("Supabase não configurado")
        ? "O catálogo ainda não está conectado ao Supabase."
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
    ["Metragem", property.metragem != null && `${Number(property.metragem).toLocaleString("pt-BR")} m²`],
    ["Quartos", property.quartos],
    ["Banheiros", property.banheiros],
    ["Vagas", property.vagas],
    ["Tipo", property.tipo],
    ["Finalidade", property.finalidade],
  ].filter(([, value]) => value != null && value !== "");

  if (!features.length) return;
  const list = node("dl", "detail-features");
  for (const [label, value] of features) {
    list.append(node("dt", "", label), node("dd", "", String(value)));
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
    detailContent.replaceChildren(
      node(
        "p",
        "catalog-status",
        error.message.includes("Supabase não configurado")
          ? "Os detalhes deste empreendimento ainda não estão conectados ao Supabase."
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
  const layout = node("div", "detail-layout");
  const gallery = node("div", "detail-gallery");
  const images = activeProperty.gallery;
  if (images.length) {
    const image = node("img");
    image.alt = `${activeProperty.titulo} — imagem ${activeImageIndex + 1}`;
    image.loading = "eager";
    image.src = images[activeImageIndex].url;
    gallery.append(image);
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
      gallery.append(controls);
    }
  } else {
    gallery.classList.add("detail-gallery-empty");
    gallery.append(node("span", "property-photo-placeholder", "Imagens ainda não cadastradas"));
  }

  const copy = node("div", "detail-copy");
  copy.append(
    node("span", "sample-label", activeProperty.finalidade),
    node("h1", "", activeProperty.titulo),
    node("p", "property-location", locationLabel(activeProperty) || "São Luís, MA"),
    node("p", "detail-description", activeProperty.descricao),
  );
  appendDetailFeatures(copy, activeProperty);
  const price = node("div", "detail-price");
  price.append(
    node("span", "property-price-label", activeProperty.finalidade === "aluguel" ? "Valor mensal" : "Valor"),
    node("strong", "property-price", formatPrice(activeProperty.preco, activeProperty.finalidade)),
  );
  const contact = node("a", "button button-dark", "Tenho interesse ↗");
  contact.href = createWhatsAppLink(propertyMessage(activeProperty));
  contact.target = "_blank";
  contact.rel = "noopener noreferrer";
  const formContact = node("a", "property-form-contact", "Prefiro enviar uma mensagem pelo formulário");
  formContact.href = `index.html?empreendimento=${encodeURIComponent(activeProperty.id)}#contato`;
  copy.append(price, contact, formContact);
  layout.append(gallery, copy);

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
      const section = node("section", "property-video-section");
      section.append(node("h2", "", "Conheça o empreendimento"), video);
      detailContent.replaceChildren(layout, section);
      return;
    } catch (error) {
      console.error("URL de vídeo inválida no cadastro:", error);
    }
  }

  detailContent.replaceChildren(layout);
}

function changeGallery(step) {
  if (!activeProperty?.gallery?.length) return;
  const images = activeProperty.gallery;
  activeImageIndex = (activeImageIndex + step + images.length) % images.length;
  const image = detailContent.querySelector(".detail-gallery > img");
  const count = detailContent.querySelector("#gallery-count");
  if (image) {
    image.src = images[activeImageIndex].url;
    image.alt = `${activeProperty.titulo} — imagem ${activeImageIndex + 1}`;
  }
  if (count) count.textContent = `${activeImageIndex + 1} / ${images.length}`;
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
propertyTrack?.addEventListener("scroll", updateCarouselControls, { passive: true });
window.addEventListener("resize", updateCarouselControls);
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
  menuToggle.addEventListener("click", () => {
    const isExpanded = menuToggle.getAttribute("aria-expanded") === "true";
    menuToggle.setAttribute("aria-expanded", String(!isExpanded));
    menuToggle.setAttribute("aria-label", isExpanded ? "Abrir menu" : "Fechar menu");
    navigation.classList.toggle("is-open", !isExpanded);
  });

  navigation.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      menuToggle.setAttribute("aria-expanded", "false");
      menuToggle.setAttribute("aria-label", "Abrir menu");
      navigation.classList.remove("is-open");
    }
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

  const carouselButton = event.target.closest("[data-carousel-step]");
  if (carouselButton && propertyTrack) {
    const card = propertyTrack.querySelector(".property-card");
    if (!card) return;
    const gap = parseFloat(getComputedStyle(propertyTrack).columnGap) || 0;
    propertyTrack.scrollBy({
      left: Number(carouselButton.dataset.carouselStep) * (card.getBoundingClientRect().width + gap),
      behavior: "smooth",
    });
  }
});

document.addEventListener("click", (event) => {
  const whatsappLink = event.target.closest(".whatsapp-link");
  if (!whatsappLink) return;
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
