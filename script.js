const WHATSAPP_PHONE = "559888659130";

const properties = [
  {
    id: "apartamento-mar",
    category: "Venda",
    title: "Apartamento com vista para o mar",
    shortTitle: "Apartamento com vista para o mar",
    location: "Ponta d'Areia, São Luís",
    area: "186 m²",
    suites: "3 suítes",
    parking: "3 vagas",
    price: "R$ 2.450.000",
    description:
      "Exemplo ilustrativo de apartamento amplo, com ambientes integrados, luz natural e uma vista privilegiada. Uma sugestão de imóvel para quem valoriza conforto e a proximidade do mar.",
    images: [
      "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1500&q=82",
      "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1500&q=82",
      "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1500&q=82",
    ],
  },
  {
    id: "casa-condominio",
    category: "Venda",
    title: "Casa em condomínio",
    shortTitle: "Casa em condomínio",
    location: "Calhau, São Luís",
    area: "320 m²",
    suites: "4 suítes",
    parking: "4 vagas",
    price: "R$ 3.180.000",
    description:
      "Exemplo ilustrativo de casa contemporânea em condomínio, com espaços generosos, integração entre áreas sociais e paisagismo. Uma referência para quem busca privacidade e conforto.",
    images: [
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1500&q=82",
      "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1500&q=82",
      "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1500&q=82",
    ],
  },
  {
    id: "cobertura-piscina",
    category: "Aluguel",
    title: "Cobertura com piscina",
    shortTitle: "Cobertura com piscina",
    location: "Renascença, São Luís",
    area: "240 m²",
    suites: "3 suítes",
    parking: "3 vagas",
    price: "R$ 14.500/mês",
    description:
      "Exemplo ilustrativo de cobertura com área de lazer privativa, piscina e ambientes pensados para receber. Uma opção demonstrativa para quem procura espaço e comodidade.",
    images: [
      "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1500&q=82",
      "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1500&q=82",
      "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1500&q=82",
    ],
  },
];

const propertyTrack = document.querySelector("#property-track");
const detailContent = document.querySelector("#property-detail-content");
const menuToggle = document.querySelector(".menu-toggle");
const navigation = document.querySelector("#navegacao");
let activeProperty = null;
let activeImageIndex = 0;

function propertyMessage(property) {
  return `Olá, Bira! Gostaria de saber mais sobre ${property.shortTitle.toLowerCase()} apresentado no seu site.`;
}

function renderProperties() {
  if (!propertyTrack) return;

  propertyTrack.innerHTML = properties
    .map(
      (property) => `
        <article class="property-card">
          <a class="property-card-link" href="imovel.html?id=${encodeURIComponent(property.id)}">
            <div class="property-photo-wrap">
              <img class="property-photo" src="${property.images[0]}" alt="${property.title}" loading="lazy" />
              <span class="property-tag">${property.category}</span>
            </div>
            <div class="property-copy">
              <span class="sample-label">Exemplo ilustrativo</span>
              <h3>${property.title}</h3>
              <p class="property-location">${property.location}</p>
            </div>
          </a>
          <div class="property-bottom">
            <div><span class="property-price-label">Valor demonstrativo</span><strong class="property-price">${property.price}</strong></div>
            <a class="property-action" href="imovel.html?id=${encodeURIComponent(property.id)}">Conhecer imóvel</a>
          </div>
        </article>
      `,
    )
    .join("");

  propertyTrack.addEventListener("scroll", updateCarouselControls, { passive: true });
  window.addEventListener("resize", updateCarouselControls);
  updateCarouselControls();
}

function updateCarouselControls() {
  if (!propertyTrack) return;
  const previous = document.querySelector('[data-carousel-step="-1"]');
  const next = document.querySelector('[data-carousel-step="1"]');
  const atStart = propertyTrack.scrollLeft <= 1;
  const atEnd = propertyTrack.scrollLeft + propertyTrack.clientWidth >= propertyTrack.scrollWidth - 1;

  previous.disabled = atStart;
  next.disabled = atEnd;
}

function showPropertyDetail() {
  if (!detailContent) return;

  const propertyId = new URLSearchParams(window.location.search).get("id");
  activeProperty = properties.find((item) => item.id === propertyId);
  if (!activeProperty) {
    detailContent.innerHTML = `
      <div class="property-not-found">
        <p class="eyebrow"><span></span> Imóvel não encontrado</p>
        <h1>Este imóvel não está disponível.</h1>
        <a class="button button-dark" href="index.html#imoveis">Voltar ao catálogo <span aria-hidden="true">↗</span></a>
      </div>
    `;
    return;
  }

  document.title = `${activeProperty.title} | Bira Lopes`;
  document.querySelector('meta[name="description"]').content =
    `${activeProperty.title} em ${activeProperty.location}. Conheça mais com Bira Lopes.`;

  detailContent.innerHTML = `
    <div class="detail-layout">
      <div class="detail-gallery">
        <img src="${activeProperty.images[activeImageIndex]}" alt="${activeProperty.title} — imagem 1" />
        <div class="gallery-controls">
          <button type="button" data-gallery-step="-1" aria-label="Imagem anterior">←</button>
          <span class="gallery-count">01 / ${String(activeProperty.images.length).padStart(2, "0")}</span>
          <button type="button" data-gallery-step="1" aria-label="Próxima imagem">→</button>
        </div>
      </div>
      <div class="detail-copy">
        <span class="sample-label">Exemplo ilustrativo · ${activeProperty.category}</span>
        <h1>${activeProperty.title}</h1>
        <p class="property-location">${activeProperty.location}</p>
        <p class="detail-description">${activeProperty.description}</p>
        <div class="detail-price">
          <span class="property-price-label">Valor demonstrativo</span>
          <strong class="property-price">${activeProperty.price}</strong>
        </div>
        <button class="button button-dark whatsapp-link" type="button" data-message="${propertyMessage(activeProperty)}">
          Tenho interesse <span aria-hidden="true">↗</span>
        </button>
        <p class="detail-disclaimer">Imóvel, imagens e valor meramente ilustrativos.</p>
      </div>
    </div>
  `;
}

function openWhatsApp(message) {
  const url = `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function changeGallery(step) {
  if (!activeProperty) return;
  activeImageIndex =
    (activeImageIndex + step + activeProperty.images.length) % activeProperty.images.length;
  const image = detailContent.querySelector(".detail-gallery img");
  const count = detailContent.querySelector(".gallery-count");
  image.src = activeProperty.images[activeImageIndex];
  image.alt = `${activeProperty.title} — imagem ${activeImageIndex + 1}`;
  count.textContent = `${String(activeImageIndex + 1).padStart(2, "0")} / ${String(activeProperty.images.length).padStart(2, "0")}`;
}

renderProperties();
showPropertyDetail();

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
  const carouselButton = event.target.closest("[data-carousel-step]");
  if (carouselButton && propertyTrack) {
    const card = propertyTrack.querySelector(".property-card");
    const gap = parseFloat(getComputedStyle(propertyTrack).columnGap) || 0;
    propertyTrack.scrollBy({
      left: Number(carouselButton.dataset.carouselStep) * (card.getBoundingClientRect().width + gap),
      behavior: "smooth",
    });
    return;
  }

  const galleryButton = event.target.closest("[data-gallery-step]");
  if (galleryButton) {
    changeGallery(Number(galleryButton.dataset.galleryStep));
    return;
  }

  const whatsappLink = event.target.closest(".whatsapp-link");
  if (whatsappLink) {
    event.preventDefault();
    openWhatsApp(
      whatsappLink.dataset.message ||
        "Olá, Bira! Gostaria de conversar sobre imóveis em São Luís.",
    );
  }
});
