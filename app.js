// AGEstor — app das empresas (login, empresa, clientes, orçamentos, catálogo, equipe e personalização).
(function () {
  "use strict";
  var A = window.AG, P = window.AG_PADRAO, esc = A.esc, $ = A.$, $$ = A.$$;
  var raiz = $("#app"), sb = null;
  var S = { user: null, membro: null, empresa: null, cfg: null, admin: false, clientes: [], catalogo: [], orcamentos: [], servicos: [], membros: [] };
  var STATUS = { rascunho: ["Rascunho", ""], enviado: ["Enviado", "atencao"], aprovado: ["Aprovado", "bom"], recusado: ["Recusado", "critico"] };

  // ---------- configuração da empresa (padrão + o que ela personalizou) ----------
  function cfgDe(e) {
    var c = (e && e.config) || {}, p = P.CONFIG;
    return {
      modulos: Object.assign({}, p.modulos, c.modulos || {}),
      rotulos: Object.assign({}, P.ROTULOS, limpos(c.rotulos)),
      orcamento: Object.assign({}, p.orcamento, c.orcamento || {})
    };
  }
  function limpos(o) { var r = {}; Object.keys(o || {}).forEach(function (k) { var v = String(o[k] || "").trim(); if (v) r[k] = v; }); return r; }
  function R(k) { return S.cfg.rotulos[k] || P.ROTULOS[k] || k; }
  function ligado(m) { return S.cfg.modulos[m] !== false; }
  function gestor() { return !!S.membro && (S.membro.papel === "dono" || S.membro.papel === "admin"); }
  function podeGravar() { return A.liberada(S.empresa); }

  function corTexto(hex) {
    var n = parseInt(String(hex).slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? "#13201e" : "#ffffff";
  }
  function aplicarMarca() {
    var e = S.empresa, d = document.documentElement.style;
    if (!e) { d.removeProperty("--prim"); d.removeProperty("--dest"); d.removeProperty("--prim-t"); return; }
    d.setProperty("--prim", e.cor1); d.setProperty("--dest", e.cor2); d.setProperty("--prim-t", corTexto(e.cor1));
    var m = $('meta[name="theme-color"]'); if (m) m.setAttribute("content", e.cor1);
    document.title = e.nome + " — AGEstor";
  }

  // ---------- entrada ----------
  function telaEntrada(modo) {
    modo = modo || "entrar";
    aplicarMarca();
    raiz.innerHTML = '<div class="entrada"><div class="logo-g">AGE<span>stor</span></div><p class="lema">O gestor da sua empresa de serviços</p>' +
      '<div class="cartao"><div class="trocar"><button type="button" data-m="entrar" class="' + (modo === "entrar" ? "ativo" : "") + '">Entrar</button>' +
      '<button type="button" data-m="criar" class="' + (modo === "criar" ? "ativo" : "") + '">Criar conta</button></div>' +
      '<form id="f-entrar"><label for="e-email">E-mail</label><input id="e-email" type="email" autocomplete="email" autocapitalize="none" required>' +
      A.campoSenha("e-senha", "Senha" + (modo === "criar" ? " (mínimo 8)" : ""), modo === "criar" ? "new-password" : "current-password") +
      '<div class="acoes"><button class="prim" id="b-entrar">' + (modo === "criar" ? "Criar conta grátis" : "Entrar") + "</button></div></form>" +
      (modo === "entrar" ? '<p class="peq" style="text-align:center"><button type="button" class="texto" id="b-esqueci">Esqueci a senha</button></p>' :
        '<p class="peq mudo">' + (A.CFG.DIAS_TESTE || 14) + " dias grátis, sem cartão. Depois você escolhe um plano.</p>") +
      '</div><p class="peq mudo" style="text-align:center"><a href="index.html">Conheça o AGEstor</a></p></div>';
    A.ligarVerSenha(raiz);
    $$("[data-m]", raiz).forEach(function (b) { b.onclick = function () { telaEntrada(b.dataset.m); }; });
    $("#f-entrar").onsubmit = function (ev) {
      ev.preventDefault();
      var b = $("#b-entrar"), email = $("#e-email").value.trim().toLowerCase(), senha = $("#e-senha").value;
      A.ocupado(b, true);
      var p = modo === "criar" ? sb.auth.signUp({ email: email, password: senha, options: { emailRedirectTo: location.href.split("#")[0].split("?")[0] } })
        : sb.auth.signInWithPassword({ email: email, password: senha });
      p.then(function (r) {
        if (r.error) throw r.error;
        if (modo === "criar" && !(r.data && r.data.session)) {
          raiz.querySelector(".cartao").innerHTML = '<h2>Confirme o seu e-mail</h2><p>Enviamos um link para <b>' + esc(email) +
            "</b>. Abra a mensagem, toque no link e depois entre com o e-mail e a senha.</p>" +
            '<div class="acoes"><button class="prim" id="b-voltar">Já confirmei, entrar</button></div>';
          $("#b-voltar").onclick = function () { telaEntrada("entrar"); };
          return;
        }
        return iniciar();
      }).catch(function (e) { A.avisar(A.msgErro(e), "erro"); }).then(function () { A.ocupado(b, false); });
    };
    var esq = $("#b-esqueci");
    if (esq) esq.onclick = function () {
      var email = $("#e-email").value.trim();
      if (!email) { A.avisar("Digite o seu e-mail primeiro.", "erro"); $("#e-email").focus(); return; }
      sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split("#")[0].split("?")[0] }).then(function (r) {
        if (r.error) throw r.error; A.avisar("Enviamos um link para criar uma senha nova.", "ok");
      }).catch(function (e) { A.avisar(A.msgErro(e), "erro"); });
    };
  }

  function novaSenha() {
    var j = A.janela('<form id="f-ns">' + A.campoSenha("ns-senha", "Senha nova (mínimo 8)", "new-password") +
      '<div class="acoes"><button class="prim">Salvar senha</button></div></form>', { titulo: "Criar senha nova", fixa: true });
    A.ligarVerSenha(j.el);
    $("#f-ns", j.el).onsubmit = function (ev) {
      ev.preventDefault();
      var b = $("button.prim", j.el); A.ocupado(b, true);
      sb.auth.updateUser({ password: $("#ns-senha", j.el).value }).then(function (r) {
        if (r.error) throw r.error; A.avisar("Senha alterada.", "ok"); j.fechar();
      }).catch(function (e) { A.avisar(A.msgErro(e), "erro"); A.ocupado(b, false); });
    };
  }

  // ---------- início: descobre a empresa da pessoa ----------
  function iniciar() {
    return sb.auth.getUser().then(function (r) {
      S.user = r.data && r.data.user;
      if (!S.user) return telaEntrada();
      return sb.from("membros").select("*").eq("usuario", S.user.id).maybeSingle().then(function (m) {
        if (m.error) throw m.error;
        S.membro = m.data && m.data.ativo ? m.data : null;
        if (!S.membro) return telaSemEmpresa();
        return Promise.all([carregarDados(), sb.rpc("eh_admin")]).then(function (x) {
          S.admin = x[1].data === true;
          aplicarMarca(); montar();
        });
      });
    }).catch(function (e) {
      raiz.innerHTML = '<div class="entrada"><div class="cartao"><h2>Não foi possível abrir</h2><p>' + esc(A.msgErro(e)) +
        '</p><div class="acoes"><button class="prim" id="b-tentar">Tentar de novo</button><button id="b-sair0">Sair</button></div></div></div>';
      $("#b-tentar").onclick = iniciar;
      $("#b-sair0").onclick = sair;
    });
  }

  var carregadoEm = 0;
  function carregarDados() {
    function q(t, ord, asc) { return sb.from(t).select("*").order(ord, { ascending: asc }).limit(2000); }
    return Promise.all([q("clientes", "nome", true), q("catalogo", "descricao", true), q("orcamentos", "criado_em", false),
      sb.from("empresas").select("*").eq("id", S.membro.empresa_id).single(), q("servicos", "criado_em", false), q("membros", "criado_em", true)]).then(function (r) {
      r.forEach(function (x) { if (x.error) throw x.error; });
      S.clientes = r[0].data || []; S.catalogo = r[1].data || []; S.orcamentos = r[2].data || [];
      S.empresa = r[3].data; S.cfg = cfgDe(S.empresa); S.servicos = r[4].data || []; S.membros = r[5].data || []; carregadoEm = Date.now();
    });
  }
  // busca o que a equipe mudou (ao trocar de aba, tocar na aba atual ou voltar ao app) sem atrapalhar quem está digitando
  function atualizar(forcar) {
    if (!S.empresa || (!forcar && Date.now() - carregadoEm < 20000)) return;
    var antes = JSON.stringify([S.clientes, S.catalogo, S.orcamentos, S.empresa, S.servicos, S.membros]);
    carregarDados().then(function () {
      if (JSON.stringify([S.clientes, S.catalogo, S.orcamentos, S.empresa, S.servicos, S.membros]) === antes) return;
      aplicarMarca();
      var foco = document.activeElement;
      if (!$(".fundo-modal") && !$(".doc-fundo") && !(foco && foco.closest && foco.closest("#tela") && /INPUT|TEXTAREA|SELECT/.test(foco.tagName))) montar();
    }).catch(function (e) { if (e && e.code === "PGRST116" && !$(".fundo-modal")) iniciar(); });  // a pessoa foi desligada da empresa
  }
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") atualizar(); });

  function telaSemEmpresa() {
    S.empresa = null; aplicarMarca();
    var cod = (new URLSearchParams(location.search).get("convite") || "").toUpperCase();
    var ramos = Object.keys(P.RAMOS).map(function (k) { return '<option value="' + k + '">' + esc(P.RAMOS[k].nome) + "</option>"; }).join("");
    raiz.innerHTML = '<div class="entrada" style="max-width:560px"><div class="logo-g">AGE<span>stor</span></div><p class="lema">Olá! Vamos começar.</p>' +
      '<div class="cartao' + (cod ? " oculto" : "") + '" id="c-criar"><h2>🏢 Criar a minha empresa</h2><p class="peq mudo">Você será o dono. Depois convida a sua equipe.</p>' +
      '<form id="f-emp"><label for="n-nome">Nome da empresa *</label><input id="n-nome" required maxlength="120" autocomplete="organization">' +
      '<label for="n-ramo">Ramo</label><select id="n-ramo">' + ramos + '</select><p class="peq mudo">Já vem uma tabela inicial de serviços e materiais do ramo (você muda os preços depois).</p>' +
      '<div class="duas"><div><label for="n-cidade">Cidade</label><input id="n-cidade" maxlength="80"></div>' +
      '<div><label for="n-zap">WhatsApp da empresa</label><input id="n-zap" inputmode="tel" maxlength="30"></div></div>' +
      '<label for="n-seu">Seu nome</label><input id="n-seu" maxlength="80" autocomplete="name">' +
      '<div class="acoes"><button class="prim" id="b-criar">Criar empresa</button></div></form></div>' +
      '<div class="cartao" id="c-conv"><h2>🔑 Tenho um código de convite</h2><p class="peq mudo">Para quem vai trabalhar numa empresa que já usa o AGEstor.</p>' +
      '<form id="f-conv"><label for="c-cod">Código</label><input id="c-cod" required maxlength="12" autocapitalize="characters" autocomplete="off" value="' + esc(cod) + '" style="text-transform:uppercase;letter-spacing:2px">' +
      '<label for="c-nome">Seu nome</label><input id="c-nome" maxlength="80" autocomplete="name">' +
      '<div class="acoes"><button class="prim" id="b-conv">Entrar na equipe</button></div></form>' +
      (cod ? '<p class="peq"><button type="button" class="texto" id="b-ver-criar">Quero criar a minha própria empresa</button></p>' : "") + "</div>" +
      '<p class="peq mudo" style="text-align:center">Entrou como ' + esc(S.user.email) + ' · <button type="button" class="texto" id="b-sair1">Sair</button></p></div>';
    $("#b-sair1").onclick = sair;
    var vc = $("#b-ver-criar"); if (vc) vc.onclick = function () { $("#c-criar").classList.remove("oculto"); vc.remove(); };
    $("#f-emp").onsubmit = function (ev) {
      ev.preventDefault();
      var b = $("#b-criar"), ramo = $("#n-ramo").value;
      A.ocupado(b, true, "Criando...");
      sb.rpc("criar_empresa", { p: { nome: A.maiuscula($("#n-nome").value.trim()), ramo: ramo, cidade: $("#n-cidade").value, whatsapp: $("#n-zap").value, seu_nome: $("#n-seu").value } })
        .then(function (r) {
          if (r.error) throw r.error;
          var itens = (P.RAMOS[ramo] || P.RAMOS.outro).itens.map(function (i) { return { tipo: i[0], descricao: i[1], un: i[2], valor: i[3] }; });
          return sb.from("catalogo").insert(itens).then(function (x) { if (x.error) A.avisar("A empresa foi criada, mas a tabela inicial não: " + A.msgErro(x.error), "erro"); });
        })
        .then(function () { history.replaceState(null, "", location.pathname); A.avisar("Empresa criada. Bem-vindo ao AGEstor!", "ok"); return iniciar(); })
        .catch(function (e) { A.avisar(A.msgErro(e), "erro"); A.ocupado(b, false); });
    };
    $("#f-conv").onsubmit = function (ev) {
      ev.preventDefault();
      var b = $("#b-conv"); A.ocupado(b, true);
      sb.rpc("entrar_com_convite", { p_codigo: $("#c-cod").value.trim().toUpperCase(), p_nome: $("#c-nome").value })
        .then(function (r) { if (r.error) throw r.error; history.replaceState(null, "", location.pathname); A.avisar("Você entrou na equipe de " + r.data.nome + ".", "ok"); return iniciar(); })
        .catch(function (e) { A.avisar(A.msgErro(e), "erro"); A.ocupado(b, false); });
    };
  }

  function sair() {
    sb.auth.signOut().catch(function () {}).then(function () {
      S = { user: null, membro: null, empresa: null, cfg: null, admin: false, clientes: [], catalogo: [], orcamentos: [], servicos: [], membros: [] };
      history.replaceState(null, "", location.pathname); telaEntrada();
    });
  }

  // ---------- estrutura (topo + abas) ----------
  function abas() {
    var l = [["inicio", "🏠 Início"]], os = ligado("servicos") && window.AG_OS;
    if (os) l.unshift(["meudia", "📍 Meu dia"]);
    if (os && gestor()) l.push(["os", "🛠️ " + R("ordens")]);
    if (ligado("orcamentos")) l.push(["orcamentos", "📄 " + R("orcamentos")]);
    if (ligado("clientes")) l.push(["clientes", "👥 " + R("clientes")]);
    if (ligado("catalogo")) l.push(["catalogo", "📦 " + R("catalogo")]);
    if (gestor() && ligado("pagamentos") && window.AG_PAG) l.push(["pagamentos", "💰 Pagamentos"]);
    if (gestor() && ligado("equipe")) l.push(["equipe", "🧑‍🔧 Equipe"]);
    if (gestor()) l.push(["empresa", "⚙️ Empresa"]);
    if (S.admin) l.push(["dono", "👑 Painel do dono"]);
    return l;
  }
  function montar() {
    var e = S.empresa;
    raiz.innerHTML = '<header class="topo">' + (e.logo ? '<img class="logo" alt="" src="' + esc(e.logo) + '">' : "") +
      '<div class="marca">' + esc(e.nome) + '</div><div class="dir"><button class="peq" id="b-conta" aria-label="Minha conta">👤</button></div></header>' +
      '<nav class="abas" id="abas"></nav><main id="tela"></main>';
    $("#b-conta").onclick = minhaConta;
    $("#abas").onclick = function (ev) {
      var l = ev.target.closest("a"); if (!l) return;
      if (l.classList.contains("ativa")) { ev.preventDefault(); irPara(); atualizar(true); }
    };
    irPara();
  }
  function irPara() {
    if (!S.empresa) return;
    var l = abas(), at = (location.hash || "").slice(1).split("/")[0];
    if (!l.some(function (x) { return x[0] === at; })) at = !gestor() && l[0][0] === "meudia" ? "meudia" : "inicio";  // quem é da equipe começa pelo dia dele
    $("#abas").innerHTML = l.map(function (x) { return '<a href="#' + x[0] + '" class="' + (x[0] === at ? "ativa" : "") + '">' + esc(x[1]) + "</a>"; }).join("");
    var t = $("#tela");
    var OS = window.AG_OS || {};
    ({ inicio: telaInicio, orcamentos: telaOrcamentos, clientes: telaClientes, catalogo: telaCatalogo, equipe: telaEquipe, empresa: telaEmpresa, dono: telaDono,
      meudia: OS.telaMeuDia, os: OS.telaOS, pagamentos: (window.AG_PAG || {}).tela })[at](t);
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", function () { irPara(); atualizar(); });

  function avisoSituacao() {
    var e = S.empresa, d = A.diasRestantes(e), zap = A.CFG.SUPORTE_WHATSAPP;
    var fale = zap ? ' <a href="' + esc(A.linkZap(zap, "Olá! Quero assinar o AGEstor para a empresa " + e.nome + ".")) + '" target="_blank" rel="noopener">Falar no WhatsApp</a>' : "";
    if (!podeGravar()) return '<div class="aviso erro"><b>Acesso só para consulta.</b> ' + (e.status === "bloqueada" || e.status === "cancelada" ? "A conta da empresa está " + esc(e.status) + "." :
      "O período terminou em " + A.data(e.valido_ate) + ".") + " Você ainda vê tudo, mas não grava nada novo." + fale + "</div>";
    if (e.status === "teste") return '<div class="aviso">🎁 Teste grátis: ' + (d <= 1 ? "termina hoje" : "faltam <b>" + d + " dias</b>") + "." + (gestor() ? fale : "") + "</div>";
    if (d <= 5) return '<div class="aviso">Sua assinatura vence em ' + A.data(e.valido_ate) + "." + (gestor() ? fale : "") + "</div>";
    return "";
  }

  // ---------- 🏠 início ----------
  function telaInicio(t) {
    var abertos = S.orcamentos.filter(function (o) { return o.status === "rascunho" || o.status === "enviado"; });
    var mes = new Date(); mes.setDate(1); mes.setHours(0, 0, 0, 0);
    var aprov = S.orcamentos.filter(function (o) { return o.status === "aprovado" && new Date(o.atualizado_em) >= mes; });
    function soma(l) { return l.reduce(function (s, o) { return s + Number(o.total || 0); }, 0); }
    var nome = (S.membro.nome || "").split(" ")[0];
    t.innerHTML = '<h2 style="margin-bottom:6px">Olá' + (nome ? ", " + esc(nome) : "") + "!</h2>" + avisoSituacao() +
      '<div class="grade">' +
      (ligado("orcamentos") ? '<div class="ladrilho"><div class="r">' + esc(R("orcamentos")) + ' em aberto</div><div class="v">' + abertos.length + '</div><div class="d">' + A.dinheiro(soma(abertos)) + "</div></div>" +
        '<div class="ladrilho"><div class="r">Aprovados no mês</div><div class="v">' + aprov.length + '</div><div class="d">' + A.dinheiro(soma(aprov)) + "</div></div>" : "") +
      (ligado("servicos") && gestor() ? '<a class="ladrilho" href="#os" style="text-decoration:none;color:inherit"><div class="r">' + esc(R("ordens")) + ' em aberto</div><div class="v">' +
        S.servicos.filter(function (x) { return x.status !== "concluida" && x.status !== "cancelada"; }).length + '</div><div class="d">' +
        S.servicos.filter(function (x) { return x.status === "andamento"; }).length + " em andamento</div></a>" : "") +
      (ligado("clientes") ? '<div class="ladrilho"><div class="r">' + esc(R("clientes")) + '</div><div class="v">' + S.clientes.length + "</div></div>" : "") +
      (ligado("catalogo") ? '<div class="ladrilho"><div class="r">' + esc(R("catalogo")) + ': itens</div><div class="v">' + S.catalogo.length + "</div></div>" : "") +
      "</div>" +
      '<div class="acoes" style="margin-bottom:14px">' + (ligado("orcamentos") ? '<button class="prim" id="b-novo-orc">+ ' + esc(R("orcamento")) + "</button>" : "") +
      (ligado("clientes") ? '<button id="b-novo-cli">+ ' + esc(R("cliente")) + "</button>" : "") + "</div>" +
      (gestor() && !S.empresa.logo ? '<div class="cartao"><h3>✨ Deixe o AGEstor com a cara da sua empresa</h3><p class="peq mudo">Coloque sua logo e suas cores, escolha as áreas que usa e até os nomes na tela (ex.: “Orçamento” → “Proposta”).</p>' +
        '<a class="botao peq" href="#empresa">Personalizar</a></div>' : "") +
      (ligado("orcamentos") ? '<div class="cartao"><div class="linha" style="margin-bottom:8px"><h3>' + esc(R("orcamentos")) + ' recentes</h3><a class="dir peq" href="#orcamentos">Ver todos</a></div><div class="lista" id="ult"></div></div>' : "");
    if ($("#b-novo-orc")) $("#b-novo-orc").onclick = function () { editarOrcamento(null); };
    if ($("#b-novo-cli")) $("#b-novo-cli").onclick = function () { editarCliente(null); };
    if ($("#ult")) listaOrcamentos($("#ult"), S.orcamentos.slice(0, 5));
  }

  // ---------- 👥 clientes ----------
  function telaClientes(t) {
    t.innerHTML = avisoSituacao() + '<div class="linha" style="margin-bottom:10px"><h2>' + esc(R("clientes")) + '</h2><button class="prim dir" id="b-novo">+ Novo</button></div>' +
      '<input id="busca" type="search" placeholder="Buscar por nome, telefone ou cidade" style="margin-bottom:10px"><div class="lista" id="lst"></div>';
    $("#b-novo").onclick = function () { editarCliente(null); };
    function desenhar() {
      var q = $("#busca").value.trim().toLowerCase();
      var l = S.clientes.filter(function (c) { return !q || [c.nome, c.telefone, c.cidade, c.documento].join(" ").toLowerCase().indexOf(q) >= 0; });
      $("#lst").innerHTML = l.length ? l.map(function (c) {
        return '<button class="item" data-id="' + c.id + '"><span class="meio"><span class="forte">' + esc(c.nome) + '</span><span class="mudo peq">' +
          esc([c.telefone, c.cidade].filter(Boolean).join(" · ") || "—") + "</span></span></button>";
      }).join("") : '<div class="vazio">' + (q ? "Nada encontrado." : "Ainda não há " + esc(R("clientes").toLowerCase()) + ".") + "</div>";
      $$("[data-id]", $("#lst")).forEach(function (b) { b.onclick = function () { editarCliente(S.clientes.find(function (c) { return c.id === b.dataset.id; })); }; });
    }
    $("#busca").oninput = desenhar; desenhar();
  }

  function editarCliente(c, depois) {
    var novo = !c; c = c || {};
    function campo(id, rot, v, extra) { return '<div><label for="cl-' + id + '">' + rot + '</label><input id="cl-' + id + '" value="' + esc(v || "") + '" ' + (extra || "") + "></div>"; }
    var j = A.janela('<form id="f-cli">' + campo("nome", "Nome *", c.nome, 'required maxlength="160"') +
      '<div class="duas">' + campo("telefone", "Telefone / WhatsApp", c.telefone, 'inputmode="tel" maxlength="30"') + campo("email", "E-mail", c.email, 'type="email" maxlength="120"') +
      campo("documento", "CPF ou CNPJ", c.documento, 'maxlength="20"') + campo("cidade", "Cidade", c.cidade, 'maxlength="80"') + "</div>" +
      campo("endereco", "Endereço", c.endereco, 'maxlength="200"') +
      '<label for="cl-obs">Observações</label><textarea id="cl-obs" rows="3" maxlength="2000">' + esc(c.obs || "") + "</textarea>" +
      '<div class="acoes"><button class="prim" id="b-salvar">Salvar</button>' +
      (!novo && c.telefone ? '<a class="botao zap" target="_blank" rel="noopener" href="' + esc(A.linkZap(c.telefone, "Olá, " + c.nome.split(" ")[0] + "!")) + '">WhatsApp</a>' : "") +
      (!novo && ligado("orcamentos") ? '<button type="button" id="b-orc">+ ' + esc(R("orcamento")) + "</button>" : "") +
      (!novo && gestor() ? '<button type="button" class="perigo" id="b-apagar">Apagar</button>' : "") + "</div></form>",
      { titulo: novo ? "Cadastrar " + R("cliente").toLowerCase() : R("cliente") });
    var el = j.el;
    $("#cl-nome", el).focus();
    $("#f-cli", el).onsubmit = function (ev) {
      ev.preventDefault();
      var b = $("#b-salvar", el), d = {};
      ["nome", "telefone", "email", "documento", "cidade", "endereco", "obs"].forEach(function (k) { var v = $("#cl-" + k, el).value.trim(); d[k] = v || null; });
      d.nome = A.maiuscula(d.nome || "");
      A.ocupado(b, true);
      (novo ? sb.from("clientes").insert(d) : sb.from("clientes").update(d).eq("id", c.id)).select().single().then(function (r) {
        if (r.error) throw r.error;
        if (novo) S.clientes.push(r.data); else S.clientes[S.clientes.indexOf(c)] = r.data;
        S.clientes.sort(function (a, b2) { return a.nome.localeCompare(b2.nome, "pt-BR"); });
        A.avisar("Salvo.", "ok"); j.fechar();
        if (depois) depois(r.data); else irPara();
      }).catch(function (e) { A.avisar(A.msgErro(e), "erro"); A.ocupado(b, false); });
    };
    var bo = $("#b-orc", el); if (bo) bo.onclick = function () { j.fechar(); editarOrcamento(null, c); };
    var ba = $("#b-apagar", el);
    if (ba) ba.onclick = function () {
      A.confirmar("Apagar " + c.nome + "? " + R("orcamentos") + " já feitos continuam guardados.", "Apagar").then(function (ok) {
        if (!ok) return;
        sb.from("clientes").delete().eq("id", c.id).then(function (r) {
          if (r.error) throw r.error;
          S.clientes = S.clientes.filter(function (x) { return x.id !== c.id; });
          S.orcamentos.forEach(function (o) { if (o.cliente_id === c.id) o.cliente_id = null; });
          A.avisar("Apagado.", "ok"); j.fechar(); irPara();
        }).catch(function (e) { A.avisar(A.msgErro(e), "erro"); });
      });
    };
  }

  // ---------- 📦 catálogo ----------
  function telaCatalogo(t) {
    var filtro = "todos";
    t.innerHTML = avisoSituacao() + '<div class="linha" style="margin-bottom:10px"><h2>' + esc(R("catalogo")) + '</h2><button class="prim dir" id="b-novo">+ Novo item</button></div>' +
      '<p class="peq mudo" style="margin-top:0">Os preços daqui entram sozinhos quando você escolhe o item ao montar ' + esc(R("orcamentos").toLowerCase()) + ".</p>" +
      '<div class="linha" style="margin-bottom:10px" id="filtros"><button class="peq" data-f="todos">Todos</button><button class="peq" data-f="servico">' + esc(R("servicos")) +
      '</button><button class="peq" data-f="material">' + esc(R("materiais")) + "</button></div>" +
      '<input id="busca" type="search" placeholder="Buscar item" style="margin-bottom:10px"><div class="lista" id="lst"></div>' +
      (gestor() ? '<div class="acoes"><button id="b-ramo">Adicionar a tabela inicial de um ramo</button></div>' : "");
    $("#b-novo").onclick = function () { editarItem(null); };
    $$("[data-f]", t).forEach(function (b) { b.onclick = function () { filtro = b.dataset.f; desenhar(); }; });
    if ($("#b-ramo")) $("#b-ramo").onclick = adicionarRamo;
    function desenhar() {
      $$("[data-f]", t).forEach(function (b) { b.classList.toggle("prim", b.dataset.f === filtro); });
      var q = $("#busca").value.trim().toLowerCase();
      var l = S.catalogo.filter(function (i) { return (filtro === "todos" || i.tipo === filtro) && (!q || (i.descricao + " " + (i.categoria || "")).toLowerCase().indexOf(q) >= 0); });
      $("#lst").innerHTML = l.length ? l.map(function (i) {
        return '<button class="item" data-id="' + i.id + '"><span class="meio"><span class="forte">' + esc(i.descricao) + '</span><span class="mudo peq">' +
          esc(i.tipo === "material" ? R("material") : R("servico")) + (i.categoria ? " · " + esc(i.categoria) : "") + '</span></span><span class="fim"><b>' +
          A.dinheiro(i.valor) + '</b><span class="mudo peq">por ' + esc(i.un) + "</span></span></button>";
      }).join("") : '<div class="vazio">Nenhum item.</div>';
      $$("[data-id]", $("#lst")).forEach(function (b) { b.onclick = function () { editarItem(S.catalogo.find(function (i) { return i.id === b.dataset.id; })); }; });
    }
    $("#busca").oninput = desenhar; desenhar();
  }

  function editarItem(i) {
    var novo = !i; i = i || { tipo: "servico", un: "un", valor: 0 };
    var j = A.janela('<form id="f-item"><label for="it-tipo">Tipo</label><select id="it-tipo"><option value="servico">' + esc(R("servico")) + '</option><option value="material">' + esc(R("material")) + "</option></select>" +
      '<label for="it-desc">Descrição *</label><input id="it-desc" required maxlength="200" value="' + esc(i.descricao || "") + '">' +
      '<div class="tres"><div><label for="it-valor">Preço (R$)</label><input id="it-valor" inputmode="decimal" value="' + esc(Number(i.valor || 0).toFixed(2).replace(".", ",")) + '"></div>' +
      '<div><label for="it-un">Unidade</label><input id="it-un" maxlength="10" value="' + esc(i.un || "un") + '" list="dl-un"></div>' +
      '<div><label for="it-cat">Categoria</label><input id="it-cat" maxlength="60" value="' + esc(i.categoria || "") + '"></div></div>' +
      '<datalist id="dl-un"><option value="un"><option value="m"><option value="m²"><option value="h"><option value="dia"><option value="pt"><option value="kit"><option value="cx"><option value="lata"><option value="rolo"></datalist>' +
      '<div class="acoes"><button class="prim" id="b-salvar">Salvar</button>' + (!novo && gestor() ? '<button type="button" class="perigo" id="b-apagar">Apagar</button>' : "") + "</div></form>",
      { titulo: novo ? "Novo item" : "Item" });
    var el = j.el;
    $("#it-tipo", el).value = i.tipo;
    $("#it-desc", el).focus();
    $("#f-item", el).onsubmit = function (ev) {
      ev.preventDefault();
      var b = $("#b-salvar", el);
      var d = { tipo: $("#it-tipo", el).value, descricao: A.maiuscula($("#it-desc", el).value.trim()), valor: Math.max(0, A.lerNumero($("#it-valor", el).value)),
        un: $("#it-un", el).value.trim() || "un", categoria: $("#it-cat", el).value.trim() || null };
      A.ocupado(b, true);
      (novo ? sb.from("catalogo").insert(d) : sb.from("catalogo").update(d).eq("id", i.id)).select().single().then(function (r) {
        if (r.error) throw r.error;
        if (novo) S.catalogo.push(r.data); else S.catalogo[S.catalogo.indexOf(i)] = r.data;
        S.catalogo.sort(function (a, b2) { return a.descricao.localeCompare(b2.descricao, "pt-BR"); });
        A.avisar("Salvo.", "ok"); j.fechar(); irPara();
      }).catch(function (e) { A.avisar(A.msgErro(e), "erro"); A.ocupado(b, false); });
    };
    var ba = $("#b-apagar", el);
    if (ba) ba.onclick = function () {
      A.confirmar("Apagar “" + i.descricao + "”? " + R("orcamentos") + " já feitos não mudam.", "Apagar").then(function (ok) {
        if (!ok) return;
        sb.from("catalogo").delete().eq("id", i.id).then(function (r) {
          if (r.error) throw r.error;
          S.catalogo = S.catalogo.filter(function (x) { return x.id !== i.id; }); A.avisar("Apagado.", "ok"); j.fechar(); irPara();
        }).catch(function (e) { A.avisar(A.msgErro(e), "erro"); });
      });
    };
  }

  function adicionarRamo() {
    var j = A.janela('<label for="r-ramo">Ramo</label><select id="r-ramo">' + Object.keys(P.RAMOS).map(function (k) {
      return '<option value="' + k + '"' + (k === S.empresa.ramo ? " selected" : "") + ">" + esc(P.RAMOS[k].nome) + "</option>";
    }).join("") + '</select><p class="peq mudo">Só entram os itens que você ainda não tem (mesmo nome).</p><div class="acoes"><button class="prim" id="b-add">Adicionar</button></div>',
      { titulo: "Tabela inicial do ramo" });
    $("#b-add", j.el).onclick = function () {
      var b = this, tem = {};
      S.catalogo.forEach(function (i) { tem[i.descricao.toLowerCase()] = 1; });
      var l = P.RAMOS[$("#r-ramo", j.el).value].itens.filter(function (i) { return !tem[i[1].toLowerCase()]; })
        .map(function (i) { return { tipo: i[0], descricao: i[1], un: i[2], valor: i[3] }; });
      if (!l.length) { A.avisar("Você já tem todos os itens desse ramo.", "ok"); j.fechar(); return; }
      A.ocupado(b, true);
      sb.from("catalogo").insert(l).select().then(function (r) {
        if (r.error) throw r.error;
        S.catalogo = S.catalogo.concat(r.data).sort(function (a, b2) { return a.descricao.localeCompare(b2.descricao, "pt-BR"); });
        A.avisar(r.data.length + " itens adicionados.", "ok"); j.fechar(); irPara();
      }).catch(function (e) { A.avisar(A.msgErro(e), "erro"); A.ocupado(b, false); });
    };
  }

  // ---------- 📄 orçamentos ----------
  function nomeCliente(o) {
    var c = o.cliente_id && S.clientes.find(function (x) { return x.id === o.cliente_id; });
    return (c && c.nome) || o.cliente_nome || "—";
  }
  function listaOrcamentos(alvo, l) {
    alvo.innerHTML = l.length ? l.map(function (o) {
      var s = STATUS[o.status] || STATUS.rascunho;
      return '<button class="item" data-id="' + o.id + '"><span class="meio"><span class="forte">nº ' + o.numero + " · " + esc(nomeCliente(o)) + '</span><span class="mudo peq">' +
        esc(o.titulo || "Sem título") + " · " + A.data(o.criado_em) + '</span></span><span class="fim"><b>' + A.dinheiro(o.total) + '</b><span class="selo ' + s[1] + '">' + s[0] + "</span></span></button>";
    }).join("") : '<div class="vazio">Ainda não há ' + esc(R("orcamentos").toLowerCase()) + ".</div>";
    $$("[data-id]", alvo).forEach(function (b) { b.onclick = function () { editarOrcamento(S.orcamentos.find(function (o) { return o.id === b.dataset.id; })); }; });
  }
  function telaOrcamentos(t) {
    var filtro = "todos";
    t.innerHTML = avisoSituacao() + '<div class="linha" style="margin-bottom:10px"><h2>' + esc(R("orcamentos")) + '</h2><button class="prim dir" id="b-novo">+ Novo</button></div>' +
      '<div class="linha" style="margin-bottom:10px"><button class="peq" data-f="todos">Todos</button>' +
      Object.keys(STATUS).map(function (k) { return '<button class="peq" data-f="' + k + '">' + STATUS[k][0] + "</button>"; }).join("") + "</div>" +
      '<input id="busca" type="search" placeholder="Buscar por número, ' + esc(R("cliente").toLowerCase()) + ' ou título" style="margin-bottom:10px"><div class="lista" id="lst"></div>';
    $("#b-novo").onclick = function () { editarOrcamento(null); };
    $$("[data-f]", t).forEach(function (b) { b.onclick = function () { filtro = b.dataset.f; desenhar(); }; });
    function desenhar() {
      $$("[data-f]", t).forEach(function (b) { b.classList.toggle("prim", b.dataset.f === filtro); });
      var q = $("#busca").value.trim().toLowerCase();
      listaOrcamentos($("#lst"), S.orcamentos.filter(function (o) {
        return (filtro === "todos" || o.status === filtro) && (!q || String(o.numero) === q.replace(/\D/g, "") || (nomeCliente(o) + " " + (o.titulo || "")).toLowerCase().indexOf(q) >= 0);
      }));
    }
    $("#busca").oninput = desenhar; desenhar();
  }

  function totaisDe(M) {
    var t = { servico: 0, material: 0 };
    M.itens.forEach(function (i) { if (String(i.descricao || "").trim()) t[i.tipo === "material" ? "material" : "servico"] += Math.round(Number(i.qtd || 0) * Number(i.valor || 0) * 100) / 100; });
    t.bruto = t.servico + t.material; t.desconto = Number(M.desconto || 0); t.total = Math.max(0, Math.round((t.bruto - t.desconto) * 100) / 100);
    return t;
  }
  function vazio(M) { return !M.id && !String(M.cliente_nome || "").trim() && !String(M.titulo || "").trim() && !M.itens.some(function (i) { return String(i.descricao || "").trim(); }); }
  function dadosOrc(M) {
    return { cliente_id: M.cliente_id || null, cliente_nome: String(M.cliente_nome || "").trim() || null, titulo: String(M.titulo || "").trim() || null,
      itens: M.itens.filter(function (i) { return String(i.descricao || "").trim(); }).map(function (i) {
        return { tipo: i.tipo, descricao: String(i.descricao).trim(), qtd: Number(i.qtd || 0), un: i.un || "un", valor: Number(i.valor || 0) };
      }),
      desconto: Number(M.desconto || 0), observacoes: String(M.observacoes || "").trim() || null, validade_dias: M.validade_dias || null, status: M.status };
  }

  // o: orçamento salvo · cli: cliente para um novo · copia: dados para um novo (Duplicar)
  function editarOrcamento(o, cli, copia) {
    var co = S.cfg.orcamento;
    var M = o ? JSON.parse(JSON.stringify(o)) : copia ? copia : { cliente_id: cli ? cli.id : null, cliente_nome: cli ? cli.nome : "", titulo: "", itens: [], desconto: 0, observacoes: "",
      validade_dias: Number(co.validade_dias) || 15, status: "rascunho" };
    if (o && o.cliente_id) M.cliente_nome = nomeCliente(o);
    if (!M.itens.length) M.itens.push({ tipo: "servico", descricao: "", qtd: 1, un: "un", valor: 0 });
    var timer = null, salvando = null, pendente = false, alterado = false, fechado = false;
    var j = A.janela('<div id="orc"></div>', { titulo: (o ? R("orcamento") + " nº " + o.numero : R("orcamento") + " (novo)"), larga: true, fixa: true,
      aoFechar: function () { fechado = true; document.removeEventListener("visibilitychange", aoEsconder); salvarJa().then(function () { irPara(); }); } });
    var el = $("#orc", j.el);
    function aoEsconder() { if (document.visibilityState === "hidden") salvarJa(); }
    document.addEventListener("visibilitychange", aoEsconder);

    var cats = S.catalogo.map(function (i) { return '<option value="' + esc(i.descricao) + '">'; }).join("");
    var clis = S.clientes.map(function (c) { return '<option value="' + esc(c.nome) + '">'; }).join("");
    el.innerHTML = (podeGravar() ? "" : avisoSituacao()) +
      '<datalist id="dl-cat">' + cats + '</datalist><datalist id="dl-cli">' + clis + "</datalist>" +
      '<div class="duas"><div><label for="o-cli">' + esc(R("cliente")) + '</label><div class="linha" style="flex-wrap:nowrap"><input id="o-cli" list="dl-cli" maxlength="160" autocomplete="off" value="' + esc(M.cliente_nome || "") + '">' +
      (ligado("clientes") ? '<button type="button" class="peq" id="o-novo-cli" title="Cadastrar ' + esc(R("cliente").toLowerCase()) + '">+</button>' : "") + "</div></div>" +
      '<div><label for="o-tit">Título / serviço</label><input id="o-tit" maxlength="200" value="' + esc(M.titulo || "") + '" placeholder="Ex.: Reforma do quadro elétrico"></div></div>' +
      '<div class="duas"><div><label for="o-st">Situação</label><select id="o-st">' + Object.keys(STATUS).map(function (k) { return '<option value="' + k + '">' + STATUS[k][0] + "</option>"; }).join("") + "</select></div>" +
      '<div><label for="o-val">Validade (dias)</label><input id="o-val" type="number" min="1" max="365" value="' + esc(M.validade_dias || "") + '"></div></div>' +
      '<h3 style="margin:16px 0 8px">Itens</h3><div class="cab-itens"><span>Tipo</span><span>Descrição</span><span>Qtd</span><span>Un</span><span>Valor (R$)</span><span style="text-align:right">Subtotal</span><span></span></div>' +
      '<div class="itens-orc" id="o-itens"></div>' +
      '<div class="acoes" style="margin-top:8px"><button type="button" id="o-add-s">+ ' + esc(R("servico")) + '</button><button type="button" id="o-add-m">+ ' + esc(R("material")) + "</button></div>" +
      '<div class="duas"><div><label for="o-obs">Observações (saem no documento)</label><textarea id="o-obs" rows="3" maxlength="3000">' + esc(M.observacoes || "") + "</textarea></div>" +
      '<div><label for="o-desc">Desconto (R$)</label><input id="o-desc" inputmode="decimal" value="' + (M.desconto ? esc(Number(M.desconto).toFixed(2).replace(".", ",")) : "") + '"><div class="totais" id="o-tot"></div></div></div>' +
      '<div class="linha" style="margin-top:10px"><span class="salvo" id="o-salvo">' + (o ? "Salvo ✓" : "Salva sozinho enquanto você digita") + "</span></div>" +
      '<div class="acoes"><button class="prim" id="o-ver">📄 Ver / PDF</button><button class="zap" id="o-zap">WhatsApp</button><button id="o-dup">Duplicar</button>' +
      (gestor() && ligado("servicos") && window.AG_OS ? '<button id="o-gerar-os">🛠️ Gerar ' + esc(R("ordem").toLowerCase()) + "</button>" : "") +
      (gestor() ? '<button class="perigo" id="o-apagar">Apagar</button>' : "") + '<button id="o-fechar">Fechar</button></div>';
    $("#o-st", el).value = M.status;
    var apag = $("#o-apagar", el); if (apag) apag.classList.toggle("oculto", !M.id);

    function linhaHtml(i, k) {
      return '<div class="linha-item" data-k="' + k + '"><select class="tipo" aria-label="Tipo"><option value="servico">' + esc(R("servico")) + '</option><option value="material">' + esc(R("material")) + "</option></select>" +
        '<input class="desc" list="dl-cat" maxlength="300" aria-label="Descrição" placeholder="Descrição" value="' + esc(i.descricao || "") + '">' +
        '<input class="qtd" inputmode="decimal" aria-label="Quantidade" value="' + esc(A.numero(i.qtd)) + '">' +
        '<input class="un" maxlength="10" aria-label="Unidade" value="' + esc(i.un || "un") + '">' +
        '<input class="valor" inputmode="decimal" aria-label="Valor unitário" value="' + esc(Number(i.valor || 0).toFixed(2).replace(".", ",")) + '">' +
        '<span class="sub"></span><button type="button" class="tirar" aria-label="Tirar item">✕</button></div>';
    }
    function desenharItens() {
      var box = $("#o-itens", el);
      box.innerHTML = M.itens.map(linhaHtml).join("");
      $$(".linha-item", box).forEach(function (row) {
        var k = Number(row.dataset.k), i = M.itens[k];
        $(".tipo", row).value = i.tipo === "material" ? "material" : "servico";
        $(".tipo", row).onchange = function () { i.tipo = this.value; mudou(); };
        $(".desc", row).oninput = function () { i.descricao = this.value; mudou(); };
        $(".desc", row).onchange = function () {
          var d = this.value.trim(), c = S.catalogo.find(function (x) { return x.descricao.toLowerCase() === d.toLowerCase(); });
          if (c) {
            i.tipo = c.tipo; i.un = c.un; if (!Number(i.valor)) i.valor = Number(c.valor);
            $(".tipo", row).value = c.tipo; $(".un", row).value = c.un; $(".valor", row).value = Number(i.valor).toFixed(2).replace(".", ",");
          }
          if (d && d !== A.maiuscula(d)) { i.descricao = A.maiuscula(d); this.value = i.descricao; }
          mudou();
        };
        $(".qtd", row).oninput = function () { i.qtd = A.lerNumero(this.value); mudou(); };
        $(".un", row).oninput = function () { i.un = this.value.trim() || "un"; mudou(); };
        $(".valor", row).oninput = function () { i.valor = Math.max(0, A.lerNumero(this.value)); mudou(); };
        $(".valor", row).onblur = function () { this.value = Number(i.valor || 0).toFixed(2).replace(".", ","); };
        $(".tirar", row).onclick = function () { M.itens.splice(k, 1); if (!M.itens.length) M.itens.push({ tipo: "servico", descricao: "", qtd: 1, un: "un", valor: 0 }); desenharItens(); mudou(); };
      });
      totais();
    }
    function totais() {
      $$(".linha-item", el).forEach(function (row) { var i = M.itens[Number(row.dataset.k)]; $(".sub", row).textContent = A.dinheiro(Math.round(Number(i.qtd || 0) * Number(i.valor || 0) * 100) / 100); });
      var t = totaisDe(M);
      $("#o-tot", el).innerHTML = "<div>" + esc(R("servicos")) + ": " + A.dinheiro(t.servico) + "</div><div>" + esc(R("materiais")) + ": " + A.dinheiro(t.material) + "</div>" +
        (t.desconto ? "<div>Desconto: − " + A.dinheiro(t.desconto) + "</div>" : "") + '<div class="total">Total: ' + A.dinheiro(t.total) + "</div>";
    }
    function addItem(tipo) {
      M.itens.push({ tipo: tipo, descricao: "", qtd: 1, un: "un", valor: 0 }); desenharItens();
      var l = $$(".linha-item .desc", el); l[l.length - 1].focus();
    }
    function marcar(txt) { var s = $("#o-salvo", el); if (s) s.textContent = txt; }
    function mudou() {
      alterado = true; totais();
      if (!podeGravar()) { marcar("Só consulta: não será salvo."); return; }
      marcar("Alterações não salvas...");
      clearTimeout(timer); timer = setTimeout(salvarJa, 1200);
    }
    function salvarJa() {
      clearTimeout(timer);
      if (salvando) { pendente = true; return salvando; }
      if (!alterado || vazio(M) || !podeGravar()) return Promise.resolve();
      alterado = false; marcar("Salvando...");
      var d = dadosOrc(M);
      var q = M.id ? sb.from("orcamentos").update(d).eq("id", M.id) : sb.from("orcamentos").insert(d);
      salvando = q.select().single().then(function (r) {
        if (r.error) throw r.error;
        var novo = !M.id; M.id = r.data.id; M.numero = r.data.numero;
        var ix = S.orcamentos.findIndex(function (x) { return x.id === r.data.id; });
        if (ix >= 0) S.orcamentos[ix] = r.data; else S.orcamentos.unshift(r.data);
        if (novo && !fechado) { $(".cab h2", j.el.parentNode).textContent = R("orcamento") + " nº " + r.data.numero; if (apag) apag.classList.remove("oculto"); }
        marcar("Salvo ✓");
      }).catch(function (e) { alterado = true; marcar("Não foi salvo: " + A.msgErro(e)); A.avisar(A.msgErro(e), "erro"); })
        .then(function () { salvando = null; if (pendente) { pendente = false; return salvarJa(); } });
      return salvando;
    }

    $("#o-cli", el).oninput = function () {
      M.cliente_nome = this.value;
      var v = this.value.trim().toLowerCase(), c = S.clientes.find(function (x) { return x.nome.toLowerCase() === v; });
      M.cliente_id = c ? c.id : null; mudou();
    };
    $("#o-cli", el).onblur = function () { if (this.value && this.value !== A.maiuscula(this.value)) { this.value = A.maiuscula(this.value); M.cliente_nome = this.value; mudou(); } };
    var nc = $("#o-novo-cli", el);
    if (nc) nc.onclick = function () {
      var n = $("#o-cli", el).value.trim();
      editarCliente(null, function (c) {
        M.cliente_id = c.id; M.cliente_nome = c.nome; $("#o-cli", el).value = c.nome;
        $("#dl-cli", el).insertAdjacentHTML("beforeend", '<option value="' + esc(c.nome) + '">'); mudou();
      });
      if (n) $("#cl-nome").value = A.maiuscula(n);
    };
    $("#o-tit", el).oninput = function () { M.titulo = this.value; mudou(); };
    $("#o-tit", el).onblur = function () { if (this.value && this.value !== A.maiuscula(this.value)) { this.value = A.maiuscula(this.value); M.titulo = this.value; mudou(); } };
    $("#o-st", el).onchange = function () { M.status = this.value; mudou(); };
    $("#o-val", el).oninput = function () { var n = parseInt(this.value, 10); M.validade_dias = n >= 1 && n <= 365 ? n : null; mudou(); };
    $("#o-obs", el).oninput = function () { M.observacoes = this.value; mudou(); };
    $("#o-desc", el).oninput = function () { M.desconto = Math.max(0, A.lerNumero(this.value)); mudou(); };
    $("#o-add-s", el).onclick = function () { addItem("servico"); };
    $("#o-add-m", el).onclick = function () { addItem("material"); };
    $("#o-fechar", el).onclick = function () { j.fechar(); };
    $("#o-ver", el).onclick = function () { salvarJa().then(function () { verDocumento(M); }); };
    $("#o-zap", el).onclick = function () {
      var c = M.cliente_id && S.clientes.find(function (x) { return x.id === M.cliente_id; });
      var w = window.open(A.linkZap(c && c.telefone ? c.telefone : "", textoZap(M)), "_blank", "noopener");
      if (M.status === "rascunho" && podeGravar() && !vazio(M)) { M.status = "enviado"; $("#o-st", el).value = "enviado"; mudou(); }
      return w;
    };
    var go = $("#o-gerar-os", el);
    if (go) go.onclick = function () { salvarJa().then(function () { if (!M.id) { A.avisar("Preencha o " + R("orcamento").toLowerCase() + " primeiro.", "erro"); return; } j.fechar(); window.AG_OS.gerarDeOrcamento(M); }); };
    $("#o-dup", el).onclick = function () {
      salvarJa().then(function () {
        var c = JSON.parse(JSON.stringify(dadosOrc(M))); c.status = "rascunho";
        j.fechar(); editarOrcamento(null, null, c);
      });
    };
    if (apag) apag.onclick = function () {
      A.confirmar("Apagar " + R("orcamento") + " nº " + M.numero + "? Não dá para desfazer.", "Apagar").then(function (ok) {
        if (!ok) return;
        clearTimeout(timer); alterado = false;
        sb.from("orcamentos").delete().eq("id", M.id).then(function (r) {
          if (r.error) throw r.error;
          S.orcamentos = S.orcamentos.filter(function (x) { return x.id !== M.id; }); M.id = null; alterado = false;
          A.avisar("Apagado.", "ok"); j.fechar();
        }).catch(function (e) { A.avisar(A.msgErro(e), "erro"); });
      });
    };
    desenharItens();
    if (copia) { mudou(); A.avisar("Cópia criada. Ajuste o que precisar.", "ok"); }
    if (!o) $("#o-cli", el).focus();
  }

  function textoZap(M) {
    var e = S.empresa, t = totaisDe(M), co = S.cfg.orcamento, l = [];
    l.push("*" + R("orcamento") + (M.numero ? " nº " + M.numero : "") + " — " + e.nome + "*");
    if (M.cliente_nome) l.push(R("cliente") + ": " + M.cliente_nome);
    if (M.titulo) l.push(M.titulo);
    l.push("");
    M.itens.filter(function (i) { return String(i.descricao || "").trim(); }).forEach(function (i) {
      var mostra = !(i.tipo === "material" && co.ocultar_valor_material);
      l.push("• " + A.numero(i.qtd) + " " + (i.un || "un") + " — " + String(i.descricao).trim() + (mostra ? ": " + A.dinheiro(Number(i.qtd) * Number(i.valor)) : ""));
    });
    l.push("");
    if (t.material && t.servico) { l.push(R("servicos") + ": " + A.dinheiro(t.servico)); l.push(R("materiais") + ": " + A.dinheiro(t.material)); }
    if (t.desconto) l.push("Desconto: − " + A.dinheiro(t.desconto));
    l.push("*Total: " + A.dinheiro(t.total) + "*");
    if (M.validade_dias) l.push("Validade: " + M.validade_dias + " dias");
    if (co.pagamento) l.push("Pagamento: " + co.pagamento);
    if (e.whatsapp) l.push("", e.nome + " · " + e.whatsapp);
    return l.join("\n");
  }

  function verDocumento(M) {
    var e = S.empresa, co = S.cfg.orcamento, t = totaisDe(M);
    var c = M.cliente_id && S.clientes.find(function (x) { return x.id === M.cliente_id; });
    var it = M.itens.filter(function (i) { return String(i.descricao || "").trim(); });
    function tabela(tipo, comValor) {
      var l = it.filter(function (i) { return (i.tipo === "material") === (tipo === "material"); });
      if (!l.length) return "";
      return "<h3>" + esc(R(tipo === "material" ? "materiais" : "servicos")) + "</h3><table><thead><tr><th>Descrição</th><th class=\"n\">Qtd</th><th>Un</th>" + (comValor ? '<th class="n">Valor</th><th class="n">Subtotal</th>' : "") +
        "</tr></thead><tbody>" + l.map(function (i) {
          return "<tr><td>" + esc(i.descricao) + '</td><td class="n">' + esc(A.numero(i.qtd)) + "</td><td>" + esc(i.un) + "</td>" +
            (comValor ? '<td class="n">' + A.dinheiro(i.valor) + '</td><td class="n">' + A.dinheiro(Number(i.qtd) * Number(i.valor)) + "</td>" : "") + "</tr>";
        }).join("") + "</tbody></table>";
    }
    var cond = [];
    if (M.validade_dias) cond.push("Validade: " + M.validade_dias + " dias.");
    if (Number(co.garantia_dias)) cond.push("Garantia do serviço: " + Number(co.garantia_dias) + " dias.");
    if (co.pagamento) cond.push("Pagamento: " + co.pagamento);
    var contato = [e.whatsapp, e.email, e.site].filter(Boolean).join(" · ");
    var f = document.createElement("div"); f.className = "doc-fundo";
    f.innerHTML = '<div class="doc-barra"><button class="prim" id="d-imp">🖨️ Imprimir / Salvar PDF</button><button class="zap" id="d-zap">WhatsApp</button><button id="d-fechar">Fechar</button></div>' +
      '<div class="doc" style="--doc-cor:' + esc(e.cor1) + '"><div class="doc-cab">' + (e.logo ? '<img alt="" src="' + esc(e.logo) + '">' : "") +
      '<div class="emp"><h1>' + esc(e.nome) + "</h1><div>" + esc([e.cnpj ? "CNPJ " + e.cnpj : "", [e.endereco, e.cidade].filter(Boolean).join(" — ")].filter(Boolean).join(" · ")) + "</div><div>" + esc(contato) + "</div></div>" +
      '<div class="num">' + esc(R("orcamento").toUpperCase()) + "<b>nº " + esc(M.numero || "—") + "</b>" + A.data(new Date()) + "</div></div>" +
      "<h3>" + esc(R("cliente")) + "</h3><div><b>" + esc(M.cliente_nome || "—") + "</b>" + (c ? "<br>" + esc([c.documento, c.telefone, c.email].filter(Boolean).join(" · ")) +
        (c.endereco || c.cidade ? "<br>" + esc([c.endereco, c.cidade].filter(Boolean).join(" — ")) : "") : "") + "</div>" +
      (M.titulo ? "<h3>Serviço</h3><div>" + esc(M.titulo) + "</div>" : "") +
      tabela("servico", true) + tabela("material", !co.ocultar_valor_material) +
      '<div class="tot">' + (t.servico && t.material ? "<div><span>" + esc(R("servicos")) + "</span><span>" + A.dinheiro(t.servico) + "</span></div><div><span>" + esc(R("materiais")) + "</span><span>" + A.dinheiro(t.material) + "</span></div>" : "") +
      (t.desconto ? "<div><span>Desconto</span><span>− " + A.dinheiro(t.desconto) + "</span></div>" : "") + '<div class="g"><span>Total</span><span>' + A.dinheiro(t.total) + "</span></div></div>" +
      (cond.length || M.observacoes ? '<h3>Condições</h3><div class="cond">' + esc(cond.concat(M.observacoes ? [String(M.observacoes).trim()] : []).join("\n")) + "</div>" : "") +
      '<div class="assin"><div>' + esc(e.nome) + "</div><div>" + esc(M.cliente_nome || R("cliente")) + "</div></div>" +
      '<div class="rod">' + (co.rodape ? esc(co.rodape) + "<br>" : "") + "Feito com AGEstor</div></div>";
    document.body.appendChild(f);
    function fechar() { f.remove(); document.body.classList.remove("imprimindo"); }
    $("#d-fechar", f).onclick = fechar;
    $("#d-imp", f).onclick = function () {
      document.body.classList.add("imprimindo");
      var antes = document.title; document.title = R("orcamento") + " " + (M.numero || "") + " - " + (M.cliente_nome || e.nome);
      setTimeout(function () { window.print(); document.title = antes; document.body.classList.remove("imprimindo"); }, 50);
    };
    $("#d-zap", f).onclick = function () { window.open(A.linkZap(c && c.telefone ? c.telefone : "", textoZap(M)), "_blank", "noopener"); };
  }

  // ---------- 🧑‍🔧 equipe ----------
  function telaEquipe(t) {
    t.innerHTML = '<div class="linha" style="margin-bottom:10px"><h2>Equipe</h2><button class="prim dir" id="b-conv">+ Convidar</button></div>' +
      '<div class="cartao"><div class="lista" id="lst"><div class="vazio">Carregando...</div></div></div>' +
      '<div class="cartao"><h3>Convites ainda não usados</h3><div class="lista" id="convs" style="margin-top:8px"></div></div>' +
      '<div class="cartao peq mudo"><b>Dono:</b> tudo. <b>Administrador:</b> tudo, menos mudar o dono e outros administradores. ' +
      "<b>Equipe:</b> usa " + esc(R("clientes").toLowerCase()) + ", " + esc(R("orcamentos").toLowerCase()) + " e " + esc(R("catalogo").toLowerCase()) + ", mas não apaga, não convida e não muda a empresa.</div>";
    $("#b-conv").onclick = convidar;
    Promise.all([sb.from("membros").select("*").order("criado_em"), sb.from("convites").select("*").is("usado_por", null).order("criado_em", { ascending: false })]).then(function (r) {
      if (r[0].error) throw r[0].error;
      var PAP = { dono: ["Dono", "bom"], admin: ["Administrador", "atencao"], equipe: ["Equipe", ""] };
      $("#lst").innerHTML = r[0].data.map(function (m) {
        var p = PAP[m.papel];
        return '<button class="item" data-id="' + m.id + '"><span class="meio"><span class="forte">' + esc(m.nome || m.email) + (m.usuario === S.user.id ? " (você)" : "") +
          '</span><span class="mudo peq">' + esc(m.email) + '</span></span><span class="fim"><span class="selo ' + p[1] + '">' + p[0] + "</span>" +
          (m.ativo ? "" : '<span class="selo critico">Desligado</span>') + "</span></button>";
      }).join("");
      $$("[data-id]", $("#lst")).forEach(function (b) { b.onclick = function () { ajustar(r[0].data.find(function (m) { return m.id === b.dataset.id; })); }; });
      var cv = (r[1].data || []).filter(function (c) { return new Date(c.expira_em) > new Date(); });
      $("#convs").innerHTML = cv.length ? cv.map(function (c) {
        return '<div class="item" style="cursor:default"><span class="meio"><span class="forte" style="letter-spacing:2px">' + esc(c.codigo) + '</span><span class="mudo peq">' +
          (c.papel === "admin" ? "Administrador" : "Equipe") + " · vale até " + A.data(c.expira_em) + '</span></span><button class="peq" data-ver="' + esc(c.codigo) + '">Enviar</button>' +
          '<button class="peq perigo" data-tirar="' + esc(c.codigo) + '">Cancelar</button></div>';
      }).join("") : '<div class="mudo peq">Nenhum.</div>';
      $$("[data-ver]", $("#convs")).forEach(function (b) { b.onclick = function () { mostrarConvite(b.dataset.ver); }; });
      $$("[data-tirar]", $("#convs")).forEach(function (b) {
        b.onclick = function () {
          sb.from("convites").delete().eq("codigo", b.dataset.tirar).then(function (x) { if (x.error) throw x.error; A.avisar("Convite cancelado.", "ok"); irPara(); })
            .catch(function (e) { A.avisar(A.msgErro(e), "erro"); });
        };
      });
    }).catch(function (e) { $("#lst").innerHTML = '<div class="aviso erro">' + esc(A.msgErro(e)) + "</div>"; });
  }
  function convidar() {
    var dono = S.membro.papel === "dono";
    var j = A.janela('<p>A pessoa cria uma conta no AGEstor e digita o código (ou abre o link). O código vale 7 dias e serve para uma pessoa.</p>' +
      '<label for="cv-papel">Acesso</label><select id="cv-papel"><option value="equipe">Equipe</option>' + (dono ? '<option value="admin">Administrador</option>' : "") + "</select>" +
      '<div class="acoes"><button class="prim" id="b-gerar">Gerar código</button></div>', { titulo: "Convidar para a equipe" });
    $("#b-gerar", j.el).onclick = function () {
      var b = this; A.ocupado(b, true);
      sb.rpc("criar_convite", { p_papel: $("#cv-papel", j.el).value }).then(function (r) {
        if (r.error) throw r.error; j.fechar(); mostrarConvite(r.data); if (location.hash === "#equipe") irPara();
      }).catch(function (e) { A.avisar(A.msgErro(e), "erro"); A.ocupado(b, false); });
    };
  }
  function mostrarConvite(cod) {
    var link = location.href.split("#")[0].split("?")[0] + "?convite=" + encodeURIComponent(cod);
    var txt = "Olá! Você foi convidado para a equipe da " + S.empresa.nome + " no AGEstor.\n1) Abra: " + link + "\n2) Crie sua conta com seu e-mail\n3) Use o código: " + cod;
    var j = A.janela('<div class="codigo">' + esc(cod) + '</div><p class="peq mudo" style="word-break:break-all">' + esc(link) + "</p>" +
      '<div class="acoes"><a class="botao zap" target="_blank" rel="noopener" href="' + esc(A.linkZap("", txt)) + '">Enviar no WhatsApp</a><button id="b-copiar">Copiar</button></div>', { titulo: "Código do convite" });
    $("#b-copiar", j.el).onclick = function () { A.copiar(txt, "Convite copiado."); };
  }
  function ajustar(m) {
    if (m.papel === "dono" || m.usuario === S.user.id) { A.avisar(m.papel === "dono" ? "O dono não pode ser alterado." : "Você não pode mudar o seu próprio acesso.", "erro"); return; }
    var dono = S.membro.papel === "dono";
    if (m.papel === "admin" && !dono) { A.avisar("Só o dono pode mudar administradores.", "erro"); return; }
    var j = A.janela("<p><b>" + esc(m.nome || m.email) + "</b><br><span class=\"mudo peq\">" + esc(m.email) + "</span></p>" +
      '<label for="aj-papel">Acesso</label><select id="aj-papel"><option value="equipe">Equipe</option>' + (dono ? '<option value="admin">Administrador</option>' : "") + "</select>" +
      '<label class="check" style="margin-top:14px"><input type="checkbox" id="aj-ativo"' + (m.ativo ? " checked" : "") + "> Pode entrar no sistema</label>" +
      '<p class="peq mudo">Desmarque quando a pessoa sair da empresa: ela perde o acesso na hora e o que ela fez continua guardado.</p>' +
      '<div class="acoes"><button class="prim" id="b-aj">Salvar</button></div>', { titulo: "Acesso da pessoa" });
    $("#aj-papel", j.el).value = m.papel;
    $("#b-aj", j.el).onclick = function () {
      var b = this; A.ocupado(b, true);
      sb.rpc("ajustar_membro", { p_id: m.id, p_papel: $("#aj-papel", j.el).value, p_ativo: $("#aj-ativo", j.el).checked }).then(function (r) {
        if (r.error) throw r.error; A.avisar("Salvo.", "ok"); j.fechar(); irPara();
      }).catch(function (e) { A.avisar(A.msgErro(e), "erro"); A.ocupado(b, false); });
    };
  }

  // ---------- ⚙️ empresa (personalização sem mexer no código) ----------
  function telaEmpresa(t) {
    var e = S.empresa, c = S.cfg, logo = e.logo || "";
    function campo(id, rot, v, extra) { return '<div><label for="em-' + id + '">' + rot + '</label><input id="em-' + id + '" value="' + esc(v || "") + '" ' + (extra || "") + "></div>"; }
    t.innerHTML = '<h2 style="margin-bottom:10px">Empresa</h2>' + avisoSituacao() +
      '<div class="cartao"><h3>Dados (saem nos documentos)</h3>' + campo("nome", "Nome *", e.nome, 'maxlength="120" required') +
      '<div class="duas">' + campo("cnpj", "CNPJ ou CPF", e.cnpj, 'maxlength="20"') + campo("whatsapp", "WhatsApp", e.whatsapp, 'inputmode="tel" maxlength="30"') +
      campo("email", "E-mail", e.email, 'type="email" maxlength="120"') + campo("site", "Site ou Instagram", e.site, 'maxlength="200"') +
      campo("cidade", "Cidade", e.cidade, 'maxlength="80"') + campo("endereco", "Endereço", e.endereco, 'maxlength="200"') + "</div>" +
      '<label for="em-ramo">Ramo</label><select id="em-ramo">' + Object.keys(P.RAMOS).map(function (k) { return '<option value="' + k + '">' + esc(P.RAMOS[k].nome) + "</option>"; }).join("") + "</select></div>" +

      '<div class="cartao"><h3>Marca</h3><div class="linha" style="margin-top:8px"><img class="logo-previa' + (logo ? "" : " oculto") + '" id="em-logo-v" alt="Logo" src="' + esc(logo) + '">' +
      '<div><label class="botao peq" for="em-logo" style="margin:0;color:var(--texto)">Escolher logo</label><input id="em-logo" type="file" accept="image/*" class="oculto">' +
      ' <button type="button" class="peq' + (logo ? "" : " oculto") + '" id="em-logo-x">Tirar logo</button></div></div>' +
      '<div class="duas"><div><label for="em-cor1">Cor principal</label><input id="em-cor1" type="color" value="' + esc(e.cor1) + '"></div>' +
      '<div><label for="em-cor2">Cor de destaque</label><input id="em-cor2" type="color" value="' + esc(e.cor2) + '"></div></div></div>' +

      '<div class="cartao"><h3>Áreas que a empresa usa</h3>' + P.MODULOS.map(function (m) {
        return '<label class="check"><input type="checkbox" data-mod="' + m.id + '"' + (c.modulos[m.id] !== false ? " checked" : "") + "> <span><b>" + esc(m.nome) + '</b><br><span class="peq mudo">' + esc(m.desc) + "</span></span></label>";
      }).join("") + "</div>" +

      '<div class="cartao"><h3>Nomes na tela</h3><p class="peq mudo">Use as palavras da sua empresa. Deixe em branco para o padrão.</p><div class="duas">' +
      Object.keys(P.ROTULOS).map(function (k) {
        var v = (e.config && e.config.rotulos && e.config.rotulos[k]) || "";
        return '<div><label for="rt-' + k + '">' + esc(P.ROTULOS[k]) + '</label><input id="rt-' + k + '" data-rot="' + k + '" maxlength="30" placeholder="' + esc(P.ROTULOS[k]) + '" value="' + esc(v) + '"></div>';
      }).join("") + "</div></div>" +

      '<div class="cartao"><h3>' + esc(R("orcamento")) + "</h3>" +
      '<div class="duas"><div><label for="oc-val">Validade padrão (dias)</label><input id="oc-val" type="number" min="1" max="365" value="' + esc(c.orcamento.validade_dias) + '"></div>' +
      '<div><label for="oc-gar">Garantia (dias, 0 = não mostrar)</label><input id="oc-gar" type="number" min="0" max="3650" value="' + esc(c.orcamento.garantia_dias) + '"></div></div>' +
      '<label for="oc-pag">Forma de pagamento</label><textarea id="oc-pag" rows="2" maxlength="500">' + esc(c.orcamento.pagamento) + "</textarea>" +
      '<label for="oc-rod">Texto no fim do documento</label><textarea id="oc-rod" rows="2" maxlength="500" placeholder="Ex.: Obrigado pela preferência!">' + esc(c.orcamento.rodape) + "</textarea>" +
      '<label class="check" style="margin-top:12px"><input type="checkbox" id="oc-ocultar"' + (c.orcamento.ocultar_valor_material ? " checked" : "") + "> Esconder o preço unitário de " + esc(R("materiais").toLowerCase()) + " no documento (mostra a lista e o total)</label></div>" +

      '<div class="acoes" style="position:sticky;bottom:0;background:var(--fundo);padding:10px 0"><button class="prim" id="em-salvar">Salvar tudo</button></div>';
    $("#em-ramo").value = e.ramo && P.RAMOS[e.ramo] ? e.ramo : "outro";
    $("#em-logo").onchange = function () {
      var f = this.files && this.files[0]; if (!f) return;
      A.reduzirImagem(f, 256).then(function (d) {
        if (d.length > 280000) throw new Error("A imagem ficou grande demais. Use uma logo mais simples.");
        logo = d; $("#em-logo-v").src = d; $("#em-logo-v").classList.remove("oculto"); $("#em-logo-x").classList.remove("oculto");
      }).catch(function (er) { A.avisar(A.msgErro(er), "erro"); });
      this.value = "";
    };
    $("#em-logo-x").onclick = function () { logo = ""; $("#em-logo-v").classList.add("oculto"); this.classList.add("oculto"); };
    $("#em-salvar").onclick = function () {
      var b = this, nome = $("#em-nome").value.trim();
      if (!nome) { A.avisar("Informe o nome da empresa.", "erro"); $("#em-nome").focus(); return; }
      var mods = {}, rot = {};
      $$("[data-mod]").forEach(function (x) { mods[x.dataset.mod] = x.checked; });
      $$("[data-rot]").forEach(function (x) { var v = x.value.trim(); if (v) rot[x.dataset.rot] = v; });
      var config = Object.assign({}, e.config || {}, { modulos: mods, rotulos: rot, orcamento: {
        validade_dias: Math.min(365, Math.max(1, parseInt($("#oc-val").value, 10) || 15)),
        garantia_dias: Math.min(3650, Math.max(0, parseInt($("#oc-gar").value, 10) || 0)),
        pagamento: $("#oc-pag").value.trim(), rodape: $("#oc-rod").value.trim(), ocultar_valor_material: $("#oc-ocultar").checked } });
      var p = { nome: nome, ramo: $("#em-ramo").value, logo: logo, cor1: $("#em-cor1").value, cor2: $("#em-cor2").value, config: config };
      ["cnpj", "whatsapp", "email", "site", "cidade", "endereco"].forEach(function (k) { p[k] = $("#em-" + k).value.trim(); });
      A.ocupado(b, true, "Salvando...");
      sb.rpc("salvar_empresa", { p: p }).then(function (r) {
        if (r.error) throw r.error;
        S.empresa = r.data; S.cfg = cfgDe(S.empresa); aplicarMarca(); montar(); A.avisar("Empresa salva.", "ok");
      }).catch(function (er) { A.avisar(A.msgErro(er), "erro"); A.ocupado(b, false); });
    };
  }

  // ---------- 👑 painel do dono do AGEstor ----------
  function telaDono(t) {
    t.innerHTML = '<h2 style="margin-bottom:10px">Painel do dono</h2><div class="cartao"><div class="lista" id="lst"><div class="vazio">Carregando...</div></div></div>';
    Promise.all([sb.from("empresas").select("*").order("criado_em", { ascending: false }), sb.from("membros").select("empresa_id,ativo")]).then(function (r) {
      if (r[0].error) throw r[0].error;
      var n = {}; (r[1].data || []).forEach(function (m) { if (m.ativo) n[m.empresa_id] = (n[m.empresa_id] || 0) + 1; });
      var ST = { teste: "atencao", ativa: "bom", bloqueada: "critico", cancelada: "critico" };
      $("#lst").innerHTML = r[0].data.length ? r[0].data.map(function (e) {
        var lib = A.liberada(e);
        return '<div class="item" style="cursor:default;flex-wrap:wrap"><span class="meio"><span class="forte">' + esc(e.nome) + '</span><span class="mudo peq">' +
          esc([e.email, e.cidade, (n[e.id] || 0) + " pessoa(s)", "desde " + A.data(e.criado_em)].filter(Boolean).join(" · ")) + '</span></span><span class="fim"><span class="selo ' + ST[e.status] + '">' +
          esc(e.status) + '</span><span class="peq ' + (lib ? "" : "mudo") + '">até ' + A.data(e.valido_ate) + "</span></span>" +
          '<div class="linha" style="width:100%"><button class="peq" data-a="ativa" data-d="30" data-id="' + e.id + '">Ativa +30 dias</button><button class="peq" data-a="ativa" data-d="365" data-id="' + e.id + '">+1 ano</button>' +
          '<button class="peq" data-a="teste" data-d="14" data-id="' + e.id + '">Teste +14</button><button class="peq perigo" data-a="bloqueada" data-d="0" data-id="' + e.id + '">Bloquear</button></div></div>';
      }).join("") : '<div class="vazio">Nenhuma empresa.</div>';
      $$("[data-a]", $("#lst")).forEach(function (b) {
        b.onclick = function () {
          A.ocupado(b, true, "...");
          sb.rpc("admin_ajustar_empresa", { p_id: b.dataset.id, p_status: b.dataset.a, p_dias: Number(b.dataset.d) }).then(function (x) {
            if (x.error) throw x.error;
            if (x.data.id === S.empresa.id) S.empresa = x.data;
            A.avisar(x.data.nome + ": " + x.data.status + " até " + A.data(x.data.valido_ate), "ok"); irPara();
          }).catch(function (e) { A.avisar(A.msgErro(e), "erro"); A.ocupado(b, false); });
        };
      });
    }).catch(function (e) { $("#lst").innerHTML = '<div class="aviso erro">' + esc(A.msgErro(e)) + "</div>"; });
  }

  // ---------- 👤 minha conta ----------
  function minhaConta() {
    var PAP = { dono: "Dono", admin: "Administrador", equipe: "Equipe" };
    var j = A.janela("<p><b>" + esc(S.user.email) + "</b><br><span class=\"mudo peq\">" + esc(S.empresa.nome) + " · " + PAP[S.membro.papel] + "</span></p>" +
      '<label for="mc-nome">Seu nome</label><input id="mc-nome" maxlength="80" value="' + esc(S.membro.nome || "") + '">' +
      '<div class="acoes"><button class="prim" id="mc-salvar">Salvar</button><button id="mc-senha">Trocar senha</button><button class="perigo" id="mc-sair">Sair</button></div><div id="mc-pag"></div>' +
      (A.CFG.SUPORTE_WHATSAPP ? '<p class="peq mudo">Ajuda: <a target="_blank" rel="noopener" href="' + esc(A.linkZap(A.CFG.SUPORTE_WHATSAPP, "Olá! Preciso de ajuda com o AGEstor.")) + '">suporte no WhatsApp</a></p>' : ""),
      { titulo: "Minha conta" });
    $("#mc-salvar", j.el).onclick = function () {
      var b = this, n = $("#mc-nome", j.el).value.trim(); A.ocupado(b, true);
      sb.rpc("salvar_meu_nome", { p_nome: n }).then(function (r) { if (r.error) throw r.error; S.membro.nome = n || null; A.avisar("Salvo.", "ok"); j.fechar(); irPara(); })
        .catch(function (e) { A.avisar(A.msgErro(e), "erro"); A.ocupado(b, false); });
    };
    $("#mc-senha", j.el).onclick = function () { j.fechar(); novaSenha(); };
    if (ligado("pagamentos") && window.AG_PAG) window.AG_PAG.meus($("#mc-pag", j.el));
    $("#mc-sair", j.el).onclick = function () { j.fechar(); sair(); };
  }

  // ---------- o que os módulos (os.js) usam daqui ----------
  window.AGX = { S: function () { return S; }, sb: function () { return sb; }, R: R, ligado: ligado, gestor: gestor, podeGravar: podeGravar,
    avisoSituacao: avisoSituacao, irPara: irPara, nomeCliente: nomeCliente, editarCliente: editarCliente, STATUS: STATUS };

  // ---------- partida ----------
  if (!A.configurado()) {
    raiz.innerHTML = '<div class="entrada"><div class="logo-g">AGE<span>stor</span></div><div class="cartao"><h2>Falta configurar</h2>' +
      "<p>Abra o arquivo <b>config.js</b> e preencha <b>SUPABASE_URL</b> e <b>SUPABASE_ANON_KEY</b> (passo a passo no LEIA-ME.md).</p></div></div>";
    return;
  }
  try { sb = A.cliente(); } catch (e) { raiz.innerHTML = '<div class="entrada"><div class="aviso erro">' + esc(e.message) + "</div></div>"; return; }
  sb.auth.onAuthStateChange(function (ev) { if (ev === "PASSWORD_RECOVERY") setTimeout(novaSenha, 300); });
  sb.auth.getSession().then(function (r) { if (r.data && r.data.session) iniciar(); else telaEntrada(new URLSearchParams(location.search).get("convite") ? "criar" : "entrar"); });
})();
