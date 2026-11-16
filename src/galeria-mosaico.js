/**
 * Galeria em mosaico + visualizador em tela cheia (estilo site do Nei),
 * adaptada ao visual do site do Bira Lopes.
 *
 * Uso:
 *   import { montarGaleria } from "./galeria-mosaico.js";
 *   const galeria = montarGaleria(fotos, titulo);
 *   // fotos = [{ url: "https://..." }, ...]  (já na ordem, capa primeiro)
 */

function criar(tag, classe = "", texto) {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  if (texto != null) el.textContent = texto;
  return el;
}

export function montarGaleria(fotos, titulo) {
  const secao = criar("section", "galeria");
  secao.setAttribute("aria-label", "Galeria de fotos do imóvel");

  if (!fotos?.length) {
    secao.classList.add("galeria-vazia");
    secao.append(criar("p", "", "Imagens ainda não cadastradas"));
    return secao;
  }

  const total = fotos.length;

  const grade = criar("div", "galeria-grade");
  grade.dataset.qtd = String(Math.min(total, 5));

  fotos.slice(0, 5).forEach((foto, i) => {
    const botao = criar("button", "galeria-foto" + (i === 0 ? " galeria-foto-principal" : ""));
    botao.type = "button";
    botao.setAttribute("aria-label", `Abrir foto ${i + 1} de ${total}`);
    const img = criar("img");
    img.src = foto.url;
    img.alt = `${titulo} — foto ${i + 1}`;
    img.loading = i === 0 ? "eager" : "lazy";
    botao.append(img);
    botao.addEventListener("click", () => abrir(i, botao));
    grade.append(botao);
  });

  const verTodas = criar("button", "galeria-ver-todas");
  verTodas.type = "button";
  verTodas.innerHTML = `<span aria-hidden="true">▦</span> Ver todas as ${total} ${total === 1 ? "foto" : "fotos"}`;
  verTodas.addEventListener("click", () => abrir(0, verTodas));
  grade.append(verTodas);

  const tela = criar("dialog", "galeria-tela");
  tela.setAttribute("aria-label", "Fotos do imóvel em tela cheia");
  if (total === 1) tela.classList.add("galeria-tela-unica");

  const topo = criar("div", "galeria-tela-topo");
  const contador = criar("span", "galeria-tela-contador");
  contador.setAttribute("aria-live", "polite");
  const fechar = criar("button", "galeria-tela-fechar", "×");
  fechar.type = "button";
  fechar.setAttribute("aria-label", "Fechar fotos");
  topo.append(contador, fechar);

  const palco = criar("div", "galeria-tela-palco");
  const anterior = criar("button", "galeria-tela-seta", "←");
  anterior.type = "button";
  anterior.setAttribute("aria-label", "Foto anterior");
  const imagem = criar("img", "galeria-tela-imagem");
  const proxima = criar("button", "galeria-tela-seta", "→");
  proxima.type = "button";
  proxima.setAttribute("aria-label", "Próxima foto");
  palco.append(anterior, imagem, proxima);

  const miniaturas = criar("div", "galeria-tela-miniaturas");
  fotos.forEach((foto, i) => {
    const mini = criar("button", "galeria-tela-mini");
    mini.type = "button";
    mini.setAttribute("aria-label", `Ver foto ${i + 1}`);
    const img = criar("img");
    img.src = foto.url;
    img.alt = "";
    img.loading = "lazy";
    mini.append(img);
    mini.addEventListener("click", () => mostrar(i));
    miniaturas.append(mini);
  });

  tela.append(topo, palco);
  if (total > 1) tela.append(miniaturas);
  secao.append(grade, tela);

  let atual = 0;
  let origem = null;

  function mostrar(i) {
    atual = (i + total) % total;
    imagem.src = fotos[atual].url;
    imagem.alt = `${titulo} — foto ${atual + 1}`;
    contador.textContent = `${atual + 1} / ${total}`;
    miniaturas.querySelectorAll(".galeria-tela-mini").forEach((m, n) => {
      const ativa = n === atual;
      m.setAttribute("aria-current", String(ativa));
      if (ativa) m.scrollIntoView({ block: "nearest", inline: "center" });
    });
    [-1, 1].forEach((d) => {
      const pre = new Image();
      pre.src = fotos[(atual + d + total) % total].url;
    });
  }

  function abrir(i, botao) {
    origem = botao;
    mostrar(i);
    tela.showModal();
    document.body.style.overflow = "hidden";
    fechar.focus();
  }

  fechar.addEventListener("click", () => tela.close());
  anterior.addEventListener("click", () => mostrar(atual - 1));
  proxima.addEventListener("click", () => mostrar(atual + 1));
  tela.addEventListener("close", () => {
    document.body.style.overflow = "";
    origem?.focus();
  });
  palco.addEventListener("click", (e) => {
    if (e.target === palco) tela.close();
  });
  tela.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); mostrar(atual - 1); }
    if (e.key === "ArrowRight") { e.preventDefault(); mostrar(atual + 1); }
  });
  let inicioX = null;
  palco.addEventListener("touchstart", (e) => { inicioX = e.touches[0].clientX; }, { passive: true });
  palco.addEventListener("touchend", (e) => {
    if (inicioX == null) return;
    const dx = e.changedTouches[0].clientX - inicioX;
    if (Math.abs(dx) > 40) mostrar(atual + (dx < 0 ? 1 : -1));
    inicioX = null;
  });

  return secao;
}
