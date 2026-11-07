import { getSupabaseClient } from "./config/supabaseClient.js";
import {
  getDashboardSummary,
  getManagedProperty,
  listLeads,
  listManagedProperties,
  saveProperty,
  updateLeadStatus,
  updatePropertyStatus,
} from "./services/adminService.js";
import {
  getAdminProfile,
  signInAdmin,
  signOutAdmin,
} from "./services/authService.js";
import {
  createImageSignedUrls,
  deletePropertyImage,
  deletePropertyWithImages,
  reorderPropertyImages,
  setPropertyCover,
  uploadPropertyImage,
} from "./services/storageService.js";
import { slugifyPropertyTitle } from "./services/validation.js";

const byId = (id) => document.getElementById(id);
const loginPanel = byId("admin-login");
const appPanel = byId("admin-app");
const notice = byId("admin-notice");
const propertyDialog = byId("property-dialog");
const propertyForm = byId("property-form");
const leadDialog = byId("lead-dialog");
const loginForm = byId("login-form");

let profile = null;
let currentView = "dashboard";
let propertyPage = 1;
let leadPage = 1;
let galleryRows = [];
let slugManuallyEdited = false;
let busy = false;

function element(tag, className = "", content = "") {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (content !== "") item.textContent = String(content);
  return item;
}

function setNotice(message = "", state = "") {
  notice.textContent = message;
  notice.dataset.state = state;
}

function showLogin(message = "") {
  loginPanel.hidden = false;
  appPanel.hidden = true;
  byId("admin-header-actions").hidden = true;
  setNotice(message);
}

function showApp() {
  loginPanel.hidden = true;
  appPanel.hidden = false;
  byId("admin-header-actions").hidden = false;
  byId("admin-user-label").textContent = profile.name || profile.email;
  byId("admin-role-badge").textContent = "Administrador";
  byId("leads-nav").hidden = false;
  byId("view-all-leads").hidden = false;
}

function setBusy(form, button, state) {
  busy = state;
  for (const control of form.elements) control.disabled = state;
  button.disabled = state;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusLabel(status) {
  return {
    rascunho: "Rascunho",
    publicado: "Publicado",
    arquivado: "Arquivado",
    novo: "Novo",
    contatado: "Contatado",
    qualificado: "Qualificado",
    convertido: "Convertido",
  }[status] || status;
}

function formatMoney(value) {
  if (value == null) return "Consulte";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function makeButton(label, className, handler) {
  const button = element("button", className, label);
  button.type = "button";
  button.addEventListener("click", handler);
  return button;
}

function createDefinitionList(entries) {
  const list = element("dl", "admin-definition-list");
  for (const [label, value] of entries) {
    if (value == null || value === "") continue;
    list.append(element("dt", "", label), element("dd", "", value));
  }
  return list;
}

async function loadDashboard() {
  const includeLeads = profile.role === "admin";
  const summary = await getDashboardSummary({ includeLeads });
  const stats = byId("admin-stats");
  stats.replaceChildren();

  const values = [
    ["Empreendimentos publicados", summary.published],
    ["Rascunhos", summary.drafts],
  ];
  if (includeLeads) values.push(["Contatos recebidos", summary.leads]);
  for (const [label, value] of values) {
    const card = element("article", "admin-stat-card");
    card.append(element("span", "", label), element("strong", "", value));
    stats.append(card);
  }

  const recent = byId("dashboard-leads");
  recent.replaceChildren();
  if (!includeLeads) {
    recent.append(element("p", "admin-empty-state", "A visualização de contatos é restrita a administradores."));
  } else if (summary.recentLeads.length === 0) {
    recent.append(element("p", "admin-empty-state", "Ainda não há contatos recebidos."));
  } else {
    for (const lead of summary.recentLeads) {
      recent.append(createLeadCard(lead, false));
    }
  }
}

function createPropertyRow(property) {
  const row = element("article", "admin-list-row");
  const summary = element("div", "admin-list-copy");
  summary.append(
    element("h3", "", property.titulo),
    element(
      "p",
      "",
      [property.bairro, property.cidade, formatMoney(property.preco)]
        .filter(Boolean)
        .join(" · "),
    ),
    element("span", "admin-status", statusLabel(property.status)),
  );

  const actions = element("div", "admin-row-actions");
  actions.append(
    makeButton("Editar", "admin-button admin-button-outline", () =>
      openPropertyEditor(property.id),
    ),
  );
  if (property.status !== "arquivado") {
    const nextStatus = property.status === "publicado" ? "rascunho" : "publicado";
    actions.append(
      makeButton(
        property.status === "publicado" ? "Despublicar" : "Publicar",
        "admin-button admin-button-outline",
        () => runAction(async () => {
          await updatePropertyStatus(property.id, nextStatus);
          await refreshPropertyList();
          setNotice(`Empreendimento ${statusLabel(nextStatus).toLowerCase()}.`);
        }),
      ),
      makeButton("Arquivar", "admin-button admin-button-outline", () =>
        runAction(async () => {
          await updatePropertyStatus(property.id, "arquivado");
          await refreshPropertyList();
          setNotice("Empreendimento arquivado.");
        }),
      ),
    );
  }
  row.append(summary, actions);
  return row;
}

async function refreshPropertyList() {
  const container = byId("property-list");
  container.replaceChildren(element("p", "admin-empty-state", "Carregando empreendimentos..."));

  const result = await listManagedProperties({ page: propertyPage });
  container.replaceChildren();
  if (result.data.length === 0) {
    container.append(element("p", "admin-empty-state", "Nenhum empreendimento cadastrado."));
  } else {
    for (const property of result.data) container.append(createPropertyRow(property));
  }

  const pagination = byId("property-pagination");
  pagination.hidden = result.count <= result.pageSize;
  byId("property-page-label").textContent =
    `Página ${result.page} de ${Math.max(1, Math.ceil(result.count / result.pageSize))}`;
  pagination.querySelector('[data-property-page="-1"]').disabled = result.page === 1;
  pagination.querySelector('[data-property-page="1"]').disabled =
    result.page * result.pageSize >= result.count;
}

function createLeadCard(lead, showStatus) {
  const row = element("article", "admin-list-row admin-lead-row");
  const copy = element("div", "admin-list-copy");
  copy.append(
    element("h3", "", lead.nome),
    element(
      "p",
      "",
      [
        lead.empreendimentos?.titulo || (lead.empreendimento_id ? "Empreendimento indisponível" : "Interesse geral"),
        formatDate(lead.created_at),
      ].join(" · "),
    ),
    element("span", "admin-status", statusLabel(lead.status)),
  );
  const actions = element("div", "admin-row-actions");
  actions.append(
    makeButton("Ver detalhes", "admin-button admin-button-outline", () => openLeadDetails(lead)),
  );

  if (showStatus) {
    const select = document.createElement("select");
    select.className = "admin-status-select";
    select.setAttribute("aria-label", `Situação de atendimento para ${lead.nome}`);
    for (const value of ["novo", "contatado", "qualificado", "convertido", "arquivado"]) {
      const option = element("option", "", statusLabel(value));
      option.value = value;
      option.selected = value === lead.status;
      select.append(option);
    }
    select.addEventListener("change", () =>
      runAction(async () => {
        await updateLeadStatus(lead.id, select.value);
        setNotice("Situação do contato atualizada.");
        await refreshLeadList();
      }),
    );
    actions.append(select);
  }

  row.append(copy, actions);
  return row;
}

async function refreshLeadList() {
  const container = byId("lead-list");
  container.replaceChildren(element("p", "admin-empty-state", "Carregando contatos..."));
  const result = await listLeads({ page: leadPage });
  container.replaceChildren();
  if (result.data.length === 0) {
    container.append(element("p", "admin-empty-state", "Ainda não há contatos recebidos."));
  } else {
    for (const lead of result.data) container.append(createLeadCard(lead, true));
  }

  const pagination = byId("lead-pagination");
  pagination.hidden = result.count <= result.pageSize;
  byId("lead-page-label").textContent =
    `Página ${result.page} de ${Math.max(1, Math.ceil(result.count / result.pageSize))}`;
  pagination.querySelector('[data-lead-page="-1"]').disabled = result.page === 1;
  pagination.querySelector('[data-lead-page="1"]').disabled =
    result.page * result.pageSize >= result.count;
}

function openLeadDetails(lead) {
  byId("lead-dialog-title").textContent = lead.nome;
  const propertyLabel =
    lead.empreendimentos?.titulo ||
    (lead.empreendimento_id ? "Empreendimento indisponível" : "Interesse geral");
  byId("lead-details").replaceChildren(
    createDefinitionList([
      ["E-mail", lead.email],
      ["Telefone", lead.telefone],
      ["Interesse", lead.tipo_interesse],
      ["Empreendimento", propertyLabel],
      ["Mensagem", lead.mensagem],
      ["Situação", statusLabel(lead.status)],
      ["Recebido em", formatDate(lead.created_at)],
      ["UTM source", lead.utm_source],
      ["UTM medium", lead.utm_medium],
      ["UTM campaign", lead.utm_campaign],
      ["UTM content", lead.utm_content],
      ["Página de origem", lead.landing_page],
      ["Referenciador", lead.referrer],
    ]),
  );

  const phone = lead.telefone.replace(/\D/g, "");
  const whatsapp = byId("lead-whatsapp");
  whatsapp.href = `https://wa.me/${encodeURIComponent(phone)}?text=${encodeURIComponent(`Olá, ${lead.nome}. Recebi sua mensagem sobre ${propertyLabel.toLowerCase()}.`)}`;
  whatsapp.hidden = phone.length < 8;
  leadDialog.showModal();
}

function setEditorFeedback(message = "", isError = false) {
  const feedback = byId("property-form-feedback");
  feedback.textContent = message;
  feedback.dataset.state = isError ? "error" : "";
}

function setFormValue(name, value) {
  const control = propertyForm.elements.namedItem(name);
  if (control.type === "checkbox") {
    control.checked = Boolean(value);
  } else {
    control.value = value == null ? "" : String(value);
  }
}

async function openPropertyEditor(id = null) {
  propertyForm.reset();
  propertyForm.elements.namedItem("id").value = "";
  slugManuallyEdited = false;
  setEditorFeedback("");
  byId("admin-gallery").hidden = true;
  byId("property-delete-row").hidden = true;
  byId("property-image-list").replaceChildren();
  byId("property-dialog-title").textContent = id
    ? "Editar empreendimento"
    : "Novo empreendimento";

  if (id) {
    try {
      const property = await getManagedProperty(id);
      if (!property) {
        setNotice("Este empreendimento não foi encontrado.", "error");
        return;
      }
      for (const name of [
        "titulo", "slug", "descricao", "tipo", "finalidade", "status",
        "endereco", "bairro", "cidade", "estado", "metragem", "quartos",
        "banheiros", "vagas", "preco", "destaque", "descricao_seo",
        "video_url", "video_ativo",
      ]) {
        setFormValue(name, property[name]);
      }
      propertyForm.elements.namedItem("id").value = property.id;
      slugManuallyEdited = true;
      byId("admin-gallery").hidden = false;
      byId("property-delete-row").hidden = false;
      propertyDialog.showModal();
      await refreshGallery(property.id);
      return;
    } catch (error) {
      setNotice(`Não foi possível carregar o empreendimento: ${error.message}`, "error");
      return;
    }
  }

  propertyDialog.showModal();
}

async function refreshGallery(propertyId) {
  const container = byId("property-image-list");
  container.replaceChildren(element("p", "admin-empty-state", "Carregando imagens..."));
  const property = await getManagedProperty(propertyId);
  if (!property) throw new Error("O empreendimento não está mais disponível.");
  galleryRows = [...(property.empreendimento_imagens ?? [])].sort((a, b) => a.ordem - b.ordem);
  const signed = await createImageSignedUrls(galleryRows.map((image) => image.storage_path));
  const urls = new Map(signed.map((item) => [item.path, item.signedUrl]));
  container.replaceChildren();

  if (!galleryRows.length) {
    container.append(element("p", "admin-empty-state", "Nenhuma imagem cadastrada."));
    return;
  }

  for (const [index, image] of galleryRows.entries()) {
    const card = element("article", "admin-image-card");
    const preview = element("img");
    preview.src = urls.get(image.storage_path);
    preview.alt = `Imagem ${index + 1} do empreendimento`;
    preview.loading = "lazy";
    card.append(preview);
    card.append(
      element("span", "admin-status", image.is_cover ? "Capa" : `Imagem ${index + 1}`),
    );
    const actions = element("div", "admin-image-actions");
    if (!image.is_cover) {
      actions.append(
        makeButton("Definir capa", "admin-button admin-button-outline", () =>
          runAction(async () => {
            await setPropertyCover(image.id);
            await refreshGallery(propertyId);
            setNotice("Imagem de capa atualizada.");
          }),
        ),
      );
    }
    if (index > 0) {
      actions.append(
        makeButton("↑", "admin-button admin-button-outline", () =>
          moveImage(propertyId, index, -1),
        ),
      );
    }
    if (index < galleryRows.length - 1) {
      actions.append(
        makeButton("↓", "admin-button admin-button-outline", () =>
          moveImage(propertyId, index, 1),
        ),
      );
    }
    actions.append(
      makeButton("Remover", "admin-button admin-button-danger", () =>
        runAction(async () => {
          if (!window.confirm("Remover esta imagem do empreendimento?")) return;
          await deletePropertyImage(image);
          await refreshGallery(propertyId);
          setNotice("Imagem removida.");
        }),
      ),
    );
    card.append(actions);
    container.append(card);
  }
}

async function moveImage(propertyId, index, direction) {
  const ordered = [...galleryRows];
  const destination = index + direction;
  [ordered[index], ordered[destination]] = [ordered[destination], ordered[index]];
  await reorderPropertyImages(propertyId, ordered.map((image) => image.id));
  await refreshGallery(propertyId);
}

async function runAction(action) {
  if (busy) return;
  setNotice("");
  try {
    await action();
  } catch (error) {
    console.error("Ação administrativa falhou:", error);
    setNotice(
      error?.message || "A operação não foi concluída. Tente novamente.",
      "error",
    );
  }
}

async function activateView(view) {
  if (view === "leads" && profile.role !== "admin") {
    setNotice("A visualização de contatos é restrita a administradores.", "error");
    return;
  }
  currentView = view;
  for (const section of document.querySelectorAll(".admin-view")) {
    section.hidden = section.id !== `${view}-view`;
  }
  for (const button of document.querySelectorAll(".admin-nav-button")) {
    button.classList.toggle("is-active", button.dataset.view === view);
  }
  byId("admin-page-title").textContent = {
    dashboard: "Visão geral",
    properties: "Empreendimentos",
    leads: "Contatos recebidos",
  }[view];

  setNotice("");
  try {
    if (view === "dashboard") await loadDashboard();
    if (view === "properties") await refreshPropertyList();
    if (view === "leads") await refreshLeadList();
  } catch (error) {
    console.error(`Falha ao carregar a área ${view}:`, error);
    setNotice(`Não foi possível carregar esta área: ${error.message}`, "error");
  }
}

async function enterPanel() {
  try {
    profile = await getAdminProfile();
  } catch (error) {
    showLogin(
      error.message.includes("Supabase não configurado")
        ? "Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para habilitar o painel."
        : "Não foi possível verificar a sessão. Tente entrar novamente.",
    );
    return;
  }

  if (!profile) {
    showLogin("Entre com uma conta autorizada para acessar o painel.");
    return;
  }

  showApp();
  await activateView(currentView);
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!loginForm.reportValidity() || busy) return;
  const button = byId("login-submit");
  const values = new FormData(loginForm);
  setBusy(loginForm, button, true);
  setNotice("Verificando acesso...");

  try {
    profile = await signInAdmin(values.get("email"), values.get("password"));
    loginForm.reset();
    showApp();
    await activateView("dashboard");
  } catch (error) {
    console.error("Falha na autenticação administrativa:", error);
    showLogin(
      error.message.includes("Supabase não configurado")
        ? "Configure as variáveis públicas do Supabase neste ambiente."
        : error.message,
    );
  } finally {
    setBusy(loginForm, button, false);
  }
});

byId("logout-button").addEventListener("click", async () => {
  try {
    await signOutAdmin();
    profile = null;
    showLogin("Sessão encerrada.");
  } catch (error) {
    console.error("Falha ao encerrar a sessão:", error);
    setNotice("Não foi possível encerrar a sessão. Tente novamente.", "error");
  }
});

for (const button of document.querySelectorAll(".admin-nav-button")) {
  button.addEventListener("click", () => activateView(button.dataset.view));
}
for (const button of document.querySelectorAll("[data-open-view]")) {
  button.addEventListener("click", () => activateView(button.dataset.openView));
}
for (const button of document.querySelectorAll("[data-close-dialog]")) {
  button.addEventListener("click", () => button.closest("dialog").close());
}

byId("new-property-button").addEventListener("click", () => openPropertyEditor());
for (const button of document.querySelectorAll("[data-property-page]")) {
  button.addEventListener("click", () => {
    propertyPage += Number(button.dataset.propertyPage);
    runAction(refreshPropertyList);
  });
}
for (const button of document.querySelectorAll("[data-lead-page]")) {
  button.addEventListener("click", () => {
    leadPage += Number(button.dataset.leadPage);
    runAction(refreshLeadList);
  });
}

propertyForm.elements.namedItem("titulo").addEventListener("input", (event) => {
  if (slugManuallyEdited) return;
  try {
    propertyForm.elements.namedItem("slug").value = slugifyPropertyTitle(event.target.value);
  } catch {
    propertyForm.elements.namedItem("slug").value = "";
  }
});
propertyForm.elements.namedItem("slug").addEventListener("input", () => {
  slugManuallyEdited = true;
});

propertyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!propertyForm.reportValidity() || busy) return;
  const button = byId("save-property-button");
  const values = new FormData(propertyForm);
  const property = {
    titulo: values.get("titulo"),
    slug: values.get("slug"),
    descricao: values.get("descricao"),
    tipo: values.get("tipo"),
    finalidade: values.get("finalidade"),
    status: values.get("status"),
    endereco: values.get("endereco"),
    bairro: values.get("bairro"),
    cidade: values.get("cidade"),
    estado: values.get("estado"),
    metragem: values.get("metragem"),
    quartos: values.get("quartos"),
    banheiros: values.get("banheiros"),
    vagas: values.get("vagas"),
    preco: values.get("preco"),
    destaque: propertyForm.elements.namedItem("destaque").checked,
    descricao_seo: values.get("descricao_seo"),
    video_url: values.get("video_url"),
    video_ativo: propertyForm.elements.namedItem("video_ativo").checked,
  };
  const id = values.get("id") || null;

  setBusy(propertyForm, button, true);
  setEditorFeedback("Salvando empreendimento...");
  try {
    const saved = await saveProperty(property, id);
    propertyForm.elements.namedItem("id").value = saved.id;
    byId("admin-gallery").hidden = false;
    byId("property-delete-row").hidden = false;
    byId("property-dialog-title").textContent = "Editar empreendimento";
    setEditorFeedback("Empreendimento salvo.");
    propertyPage = 1;
    if (!id) setNotice("Empreendimento cadastrado.");
    try {
      await refreshGallery(saved.id);
    } catch (galleryError) {
      console.error("Empreendimento salvo, mas a galeria não foi atualizada:", galleryError);
      setEditorFeedback(
        `Empreendimento salvo, mas não foi possível atualizar a galeria: ${galleryError.message}`,
        true,
      );
    }
    try {
      await refreshPropertyList();
      await refreshDashboardCounts();
    } catch (refreshError) {
      console.error("Empreendimento salvo, mas as listas não foram atualizadas:", refreshError);
      setNotice(
        `Empreendimento salvo, mas a lista precisa ser atualizada: ${refreshError.message}`,
        "error",
      );
    }
  } catch (error) {
    console.error("Falha ao salvar empreendimento:", error);
    setEditorFeedback(
      error.message.includes("duplicate key")
        ? "Este slug já está sendo usado. Escolha outro."
        : error.message,
      true,
    );
  } finally {
    setBusy(propertyForm, button, false);
  }
});

async function refreshDashboardCounts() {
  if (currentView !== "dashboard") return;
  await loadDashboard();
}

byId("property-images").addEventListener("change", async (event) => {
  const propertyId = propertyForm.elements.namedItem("id").value;
  const files = Array.from(event.target.files ?? []);
  if (!propertyId || files.length === 0) return;
  const input = event.target;
  input.disabled = true;
  setEditorFeedback(`Enviando ${files.length} imagem(ns)...`);
  try {
    for (const file of files) {
      await uploadPropertyImage(propertyId, file);
    }
    await refreshGallery(propertyId);
    setEditorFeedback("Imagens enviadas.");
  } catch (error) {
    console.error("Falha no envio de imagem:", error);
    setEditorFeedback(error.message, true);
    try {
      await refreshGallery(propertyId);
    } catch (refreshError) {
      console.error("Falha ao atualizar a galeria:", refreshError);
    }
  } finally {
    input.disabled = false;
    input.value = "";
  }
});

byId("delete-property-button").addEventListener("click", () => runAction(async () => {
  const id = propertyForm.elements.namedItem("id").value;
  const title = propertyForm.elements.namedItem("titulo").value;
  if (
    !window.confirm(
      `Excluir definitivamente "${title}" e todas as imagens? Esta ação não pode ser desfeita.`,
    )
  ) {
    return;
  }
  await deletePropertyWithImages(id);
  propertyDialog.close();
  await refreshPropertyList();
  await refreshDashboardCounts();
  setNotice("Empreendimento e imagens excluídos.");
}));

getSupabaseClientSafe();

function getSupabaseClientSafe() {
  try {
    const client = getSupabaseClient();
    client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        queueMicrotask(() => {
          profile = null;
          showLogin("Sua sessão foi encerrada.");
        });
      }
    });
  } catch {
    showLogin(
      "Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para habilitar o painel.",
    );
    return;
  }
  enterPanel();
}
