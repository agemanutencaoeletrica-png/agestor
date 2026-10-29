// Funções usadas pelo app e pelo site do AGEstor.
(function () {
  "use strict";
  var CFG = window.AGESTOR_CONFIG || {};
  var DIA = 864e5;

  function esc(t) {
    if (t === null || t === undefined) return "";
    return String(t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function data(v) { return v ? new Date(v).toLocaleDateString("pt-BR") : ""; }
  function dinheiro(v) { return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
  function numero(v) { return Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 }); }
  // "1.234,56", "3,5" ou "3.5" -> número
  function lerNumero(t) {
    var s = String(t === undefined || t === null ? "" : t).trim().replace(/[^\d.,-]/g, "");
    if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  function soDigitos(t) { return String(t || "").replace(/\D/g, ""); }
  function linkZap(tel, texto) {
    var n = soDigitos(tel); if (n.length === 10 || n.length === 11) n = "55" + n;
    return "https://wa.me/" + n + "?text=" + encodeURIComponent(texto);
  }
  function maiuscula(t) { t = String(t || ""); return t.charAt(0).toUpperCase() + t.slice(1); }

  // empresa pode gravar? (mesma regra do banco)
  function liberada(e) { return !!e && (e.status === "teste" || e.status === "ativa") && new Date(e.valido_ate).getTime() > Date.now(); }
  function diasRestantes(e) { return Math.ceil((new Date(e.valido_ate).getTime() - Date.now()) / DIA); }

  function avisar(msg, tipo) {
    var c = $("#avisos");
    if (!c) { c = document.createElement("div"); c.id = "avisos"; c.setAttribute("role", "status"); document.body.appendChild(c); }
    var t = document.createElement("div"); t.className = "toast " + (tipo || ""); t.textContent = msg; c.appendChild(t);
    while (c.children.length > 3) c.removeChild(c.firstChild);
    setTimeout(function () { t.remove(); }, tipo === "erro" ? 6000 : 3500);
  }
  function msgErro(e) {
    if (!e) return "Erro desconhecido.";
    var m = e.message || e.error_description || e.msg || String(e);
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "Sem internet ou servidor fora do ar. Tente de novo.";
    if (/Invalid login/i.test(m)) return "E-mail ou senha errados. Toque no 👁 para conferir a senha.";
    if (/already registered|already been registered/i.test(m)) return "Este e-mail já tem cadastro. Use “Entrar”.";
    if (/Password should be at least/i.test(m)) return "A senha precisa ter pelo menos 8 letras ou números.";
    if (/Email not confirmed/i.test(m)) return "Confirme o seu e-mail (abra a mensagem que enviamos) e entre de novo.";
    if (/JWT|expired/i.test(m)) return "Sua sessão expirou. Entre de novo.";
    if (/row-level security|permission denied/i.test(m)) return "Sem permissão para gravar. Se o período de teste ou a assinatura venceu, fale com o suporte.";
    return m;
  }
  function janela(html, op) {
    op = op || {};
    var f = document.createElement("div"); f.className = "fundo-modal";
    f.innerHTML = '<div class="modal ' + (op.larga ? "larga" : "") + '" role="dialog" aria-modal="true"><div class="cab"><h2>' + esc(op.titulo || "") +
      '</h2><button class="fechar" aria-label="Fechar">✕</button></div><div class="corpo">' + html + "</div></div>";
    document.body.appendChild(f); document.body.style.overflow = "hidden";
    var fechado = false;
    function fechar() {
      if (fechado) return; fechado = true; f.remove();
      if (!$(".fundo-modal")) document.body.style.overflow = "";
      if (op.aoFechar) op.aoFechar();
    }
    $(".fechar", f).onclick = fechar;
    f.addEventListener("mousedown", function (ev) { if (ev.target === f && !op.fixa) fechar(); });
    return { el: $(".corpo", f), fechar: fechar };
  }
  function confirmar(msg, sim) {
    return new Promise(function (ok) {
      var j = janela('<p>' + esc(msg) + '</p><div class="acoes"><button data-n>Cancelar</button><button class="perigo" data-s>' + esc(sim || "Sim") + "</button></div>",
        { titulo: "Confirme", aoFechar: function () { ok(false); } });
      $("[data-n]", j.el).onclick = function () { j.fechar(); };
      $("[data-s]", j.el).onclick = function () { ok(true); j.fechar(); };
    });
  }
  function ocupado(b, sim, txt) {
    if (!b) return;
    if (sim) { b.dataset.orig = b.innerHTML; b.disabled = true; b.innerHTML = '<span class="carregando"></span> ' + esc(txt || "Aguarde..."); }
    else { b.disabled = false; if (b.dataset.orig !== undefined) b.innerHTML = b.dataset.orig; }
  }
  function campoSenha(id, rotulo, auto) {
    return '<label for="' + id + '">' + rotulo + '</label><div style="position:relative"><input id="' + id + '" type="password" autocomplete="' + auto +
      '" autocapitalize="none" autocorrect="off" spellcheck="false" required minlength="8" style="padding-right:52px"><button type="button" class="texto" data-ver-senha="' + id +
      '" aria-label="Mostrar a senha" style="position:absolute;right:2px;top:50%;transform:translateY(-50%);font-size:20px">👁</button></div>';
  }
  function ligarVerSenha(r) {
    $$("[data-ver-senha]", r).forEach(function (b) {
      b.onclick = function () { var i = $("#" + b.dataset.verSenha), v = i.type === "password"; i.type = v ? "text" : "password"; b.textContent = v ? "🙈" : "👁"; };
    });
  }
  function configurado() { return !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY); }
  function cliente() {
    if (!window.supabase || !window.supabase.createClient) throw new Error("Não foi possível carregar o sistema. Verifique a internet.");
    return window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  }
  function copiar(texto, msg) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(texto).then(function () { avisar(msg || "Copiado", "ok"); }, function () { window.prompt("Copie:", texto); });
    window.prompt("Copie:", texto); return Promise.resolve();
  }
  // reduz uma imagem (logo) para no máximo "lado" px e devolve data URL
  function reduzirImagem(arquivo, lado) {
    return new Promise(function (ok, erro) {
      if (!arquivo || !/^image\//.test(arquivo.type)) return erro(new Error("Escolha uma imagem (PNG ou JPG)."));
      var fr = new FileReader();
      fr.onerror = function () { erro(new Error("Não consegui ler a imagem.")); };
      fr.onload = function () {
        var img = new Image();
        img.onerror = function () { erro(new Error("Não consegui abrir a imagem.")); };
        img.onload = function () {
          var k = Math.min(1, lado / Math.max(img.width, img.height)), c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          var png = c.toDataURL("image/png");
          ok(png.length <= 200000 ? png : c.toDataURL("image/jpeg", 0.85));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(arquivo);
    });
  }

  // foto do celular -> JPEG de no máximo "lado" px (Blob), para enviar rápido mesmo com internet fraca
  function reduzirFoto(arquivo, lado) {
    return reduzirImagemCanvas(arquivo, lado || 1600).then(function (c) {
      return new Promise(function (ok, erro) { c.toBlob(function (b) { b ? ok(b) : erro(new Error("Não consegui preparar a foto.")); }, "image/jpeg", 0.82); });
    });
  }
  function reduzirImagemCanvas(arquivo, lado) {
    return new Promise(function (ok, erro) {
      if (!arquivo || !/^image\//.test(arquivo.type)) return erro(new Error("Escolha uma foto (JPG ou PNG)."));
      var url = URL.createObjectURL(arquivo), img = new Image();
      img.onerror = function () { URL.revokeObjectURL(url); erro(new Error("Não consegui abrir a foto.")); };
      img.onload = function () {
        URL.revokeObjectURL(url);
        var k = Math.min(1, lado / Math.max(img.width, img.height)), c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
        var x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
        ok(c);
      };
      img.src = url;
    });
  }
  // localização do celular (resolve null se a pessoa negar ou não houver GPS)
  function posicao() {
    return new Promise(function (ok) {
      if (!navigator.geolocation) return ok(null);
      navigator.geolocation.getCurrentPosition(function (p) { ok({ lat: p.coords.latitude, lng: p.coords.longitude, precisao: Math.round(p.coords.accuracy) }); },
        function () { ok(null); }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 });
    });
  }
  function hora(v) { return new Date(v).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
  function linkMapa(lat, lng) { return "https://www.google.com/maps/search/?api=1&query=" + lat + "," + lng; }
  function linkRota(endereco, maps) { return maps || "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(endereco || ""); }

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(function () {}); });
  }

  window.AG = { CFG: CFG, DIA: DIA, esc: esc, $: $, $$: $$, data: data, dinheiro: dinheiro, numero: numero, lerNumero: lerNumero, soDigitos: soDigitos,
    linkZap: linkZap, maiuscula: maiuscula, liberada: liberada, diasRestantes: diasRestantes, avisar: avisar, msgErro: msgErro, janela: janela,
    confirmar: confirmar, ocupado: ocupado, campoSenha: campoSenha, ligarVerSenha: ligarVerSenha, configurado: configurado, cliente: cliente,
    copiar: copiar, reduzirImagem: reduzirImagem, reduzirFoto: reduzirFoto, posicao: posicao, hora: hora, linkMapa: linkMapa, linkRota: linkRota };
})();
