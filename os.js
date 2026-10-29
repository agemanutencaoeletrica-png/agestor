// AGEstor — ordens de serviço (gestor) e app do funcionário ("Meu dia": chegada/saída com GPS, fotos, relatório e assinatura).
(function () {
  "use strict";
  var A = window.AG, esc = A.esc, $ = A.$, $$ = A.$$;
  var X = function () { return window.AGX; };
  var ST = { aberta: ["Aberta", ""], agendada: ["Agendada", "atencao"], andamento: ["Em andamento", "atencao"], concluida: ["Concluída", "bom"], cancelada: ["Cancelada", "critico"] };
  var TIPO = { chegada: "📍 Chegada", foto: "📷 Foto", saida: "🏁 Saída" };
  var urls = {};   // caminho no Storage -> link temporário

  function S() { return X().S(); }
  function sb() { return X().sb(); }
  function R(k) { return X().R(k); }
  function gestor() { return X().gestor(); }
  function hoje() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function dataCurta(d) { if (!d) return ""; var p = String(d).slice(0, 10).split("-"); return p[2] + "/" + p[1] + (p[0] !== String(new Date().getFullYear()) ? "/" + p[0] : ""); }
  function nomePessoa(uid) {
    var m = S().membros.find(function (x) { return x.usuario === uid; });
    return m ? (m.nome || m.email.split("@")[0]) : "—";
  }
  function nomeCli(s) {
    var c = s.cliente_id && S().clientes.find(function (x) { return x.id === s.cliente_id; });
    return (c && c.nome) || s.cliente_nome || "—";
  }
  function clienteDe(s) { return s.cliente_id && S().clientes.find(function (x) { return x.id === s.cliente_id; }); }
  function telDe(s) { var c = clienteDe(s); return s.telefone || (c && c.telefone) || ""; }
  function endDe(s) { var c = clienteDe(s); return s.endereco || (c && [c.endereco, c.cidade].filter(Boolean).join(" — ")) || ""; }
  function atualizarLocal(s) {
    var l = S().servicos, i = l.findIndex(function (x) { return x.id === s.id; });
    if (i >= 0) l[i] = s; else l.unshift(s);
  }
  function recarregarOS(id) {
    return sb().from("servicos").select("*").eq("id", id).single().then(function (r) { if (r.error) throw r.error; atualizarLocal(r.data); return r.data; });
  }

  // ---------- fotos no Storage ----------
  function enviarImagem(servicoId, blob) {
    var cam = S().empresa.id + "/" + servicoId + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ".jpg";
    return sb().storage.from("fotos").upload(cam, blob, { contentType: "image/jpeg", upsert: false }).then(function (r) {
      if (r.error) throw r.error; return cam;
    });
  }
  function links(caminhos) {
    var falta = caminhos.filter(function (c) { return c && !urls[c]; });
    if (!falta.length) return Promise.resolve(urls);
    return sb().storage.from("fotos").createSignedUrls(falta, 3600).then(function (r) {
      (r.data || []).forEach(function (x) { if (x.signedUrl) urls[x.path] = x.signedUrl; });
      return urls;
    }).catch(function () { return urls; });
  }
  function detalhes(id) {
    return Promise.all([sb().from("pontos").select("*").eq("servico_id", id).order("criado_em"), sb().from("relatorios").select("*").eq("servico_id", id).maybeSingle()])
      .then(function (r) {
        if (r[0].error) throw r[0].error;
        var pts = r[0].data || [], rel = r[1].data || null;
        var cams = pts.map(function (p) { return p.foto; }).concat(rel && rel.assinatura ? [rel.assinatura] : []).filter(Boolean);
        return links(cams).then(function () { return { pontos: pts, rel: rel }; });
      });
  }
  function htmlPontos(pts) {
    if (!pts.length) return '<div class="mudo peq">Nada registrado ainda.</div>';
    return '<div class="lista">' + pts.map(function (p) {
      return '<div class="item" style="cursor:default;align-items:flex-start">' + (p.foto && urls[p.foto] ? '<a href="' + esc(urls[p.foto]) + '" target="_blank" rel="noopener"><img class="foto-mini" alt="Foto" src="' + esc(urls[p.foto]) + '"></a>' : "") +
        '<span class="meio"><span class="forte">' + TIPO[p.tipo] + " · " + A.data(p.criado_em) + " " + A.hora(p.criado_em) + '</span><span class="mudo peq">' + esc(nomePessoa(p.usuario)) +
        (p.lat != null ? ' · <a target="_blank" rel="noopener" href="' + esc(A.linkMapa(p.lat, p.lng)) + '">ver no mapa</a>' + (p.precisao ? " (±" + Math.round(p.precisao) + " m)" : "") : ' · <span class="selo atencao">sem GPS</span>') +
        "</span>" + (p.obs ? '<span class="peq">' + esc(p.obs) + "</span>" : "") + "</span></div>";
    }).join("") + "</div>";
  }

  // ---------- 🛠️ lista do gestor ----------
  function telaOS(t) {
    var filtro = "abertas";
    var F = { abertas: "Em aberto", hoje: "Hoje", concluida: "Concluídas", cancelada: "Canceladas", todas: "Todas" };
    t.innerHTML = X().avisoSituacao() + '<div class="linha" style="margin-bottom:10px"><h2>' + esc(R("ordens")) + '</h2><button class="prim dir" id="b-nova-os">+ Nova</button></div>' +
      '<div class="linha" style="margin-bottom:10px">' + Object.keys(F).map(function (k) { return '<button class="peq" data-f="' + k + '">' + F[k] + "</button>"; }).join("") + "</div>" +
      '<input id="busca" type="search" placeholder="Buscar por número, ' + esc(R("cliente").toLowerCase()) + ', título ou pessoa" style="margin-bottom:10px"><div class="lista" id="lst"></div>';
    $("#b-nova-os").onclick = function () { editarOS(null); };
    $$("[data-f]", t).forEach(function (b) { b.onclick = function () { filtro = b.dataset.f; desenhar(); }; });
    function desenhar() {
      $$("[data-f]", t).forEach(function (b) { b.classList.toggle("prim", b.dataset.f === filtro); });
      var q = $("#busca").value.trim().toLowerCase(), h = hoje();
      var l = S().servicos.filter(function (s) {
        var ok = filtro === "todas" || (filtro === "abertas" ? s.status !== "concluida" && s.status !== "cancelada" : filtro === "hoje" ? s.data_prevista === h : s.status === filtro);
        return ok && (!q || String(s.numero) === q.replace(/\D/g, "") || [nomeCli(s), s.titulo, nomePessoa(s.responsavel), s.endereco].join(" ").toLowerCase().indexOf(q) >= 0);
      });
      if (filtro === "abertas" || filtro === "hoje") l.sort(function (a, b) { return String(a.data_prevista || "9").localeCompare(String(b.data_prevista || "9")) || a.numero - b.numero; });
      listaOS($("#lst"), l, function (s) { editarOS(s); });
    }
    $("#busca").oninput = desenhar; desenhar();
  }
  function listaOS(alvo, l, abrir) {
    var h = hoje();
    alvo.innerHTML = l.length ? l.map(function (s) {
      var st = ST[s.status], atrasada = s.data_prevista && s.data_prevista < h && s.status !== "concluida" && s.status !== "cancelada";
      return '<button class="item" data-id="' + s.id + '"><span class="meio"><span class="forte">nº ' + s.numero + " · " + esc(s.titulo) + '</span><span class="mudo peq">' +
        esc([nomeCli(s), s.responsavel ? "👤 " + nomePessoa(s.responsavel) : "sem responsável"].join(" · ")) + '</span></span><span class="fim">' +
        (s.data_prevista ? '<span class="peq' + (atrasada ? " forte" : "") + '" style="' + (atrasada ? "color:var(--critico)" : "") + '">' + (s.data_prevista === h ? "Hoje" : dataCurta(s.data_prevista)) + "</span>" : "") +
        '<span class="selo ' + st[1] + '">' + st[0] + "</span></span></button>";
    }).join("") : '<div class="vazio">Nada por aqui.</div>';
    $$("[data-id]", alvo).forEach(function (b) { b.onclick = function () { abrir(S().servicos.find(function (s) { return s.id === b.dataset.id; })); }; });
  }

  // ---------- editar ordem (gestor) ----------
  function editarOS(s, base) {
    var novo = !s, d = s || base || {};
    var pessoas = S().membros.filter(function (m) { return m.ativo || m.usuario === d.responsavel; });
    var clis = S().clientes.map(function (c) { return '<option value="' + esc(c.nome) + '">'; }).join("");
    var j = A.janela('<form id="f-os"><datalist id="dl-cli-os">' + clis + "</datalist>" +
      '<label for="os-tit">O que fazer *</label><input id="os-tit" required maxlength="200" value="' + esc(d.titulo || "") + '" placeholder="Ex.: Trocar disjuntor do quadro">' +
      '<div class="duas"><div><label for="os-cli">' + esc(R("cliente")) + '</label><input id="os-cli" list="dl-cli-os" maxlength="160" autocomplete="off" value="' + esc(d.cliente_id ? nomeCli(d) : d.cliente_nome || "") + '"></div>' +
      '<div><label for="os-tel">Telefone no local</label><input id="os-tel" inputmode="tel" maxlength="30" value="' + esc(d.telefone || "") + '"></div></div>' +
      '<label for="os-end">Endereço</label><input id="os-end" maxlength="250" value="' + esc(d.endereco || "") + '" placeholder="Rua, número, bairro, cidade">' +
      '<label for="os-maps">Link do Google Maps (opcional)</label><input id="os-maps" type="url" maxlength="500" value="' + esc(d.maps_url || "") + '" placeholder="https://maps.app.goo.gl/...">' +
      '<label for="os-desc">Detalhes para a equipe</label><textarea id="os-desc" rows="3" maxlength="3000">' + esc(d.descricao || "") + "</textarea>" +
      '<div class="tres"><div><label for="os-data">Data</label><input id="os-data" type="date" value="' + esc(d.data_prevista || "") + '"></div>' +
      '<div><label for="os-resp">Quem vai fazer</label><select id="os-resp"><option value="">— ninguém ainda —</option>' +
      pessoas.map(function (m) { return '<option value="' + m.usuario + '">' + esc(m.nome || m.email) + "</option>"; }).join("") + "</select></div>" +
      '<div><label for="os-st">Situação</label><select id="os-st">' + Object.keys(ST).map(function (k) { return '<option value="' + k + '">' + ST[k][0] + "</option>"; }).join("") + "</select></div></div>" +
      (d.orcamento_id ? '<p class="peq mudo">Veio do ' + esc(R("orcamento").toLowerCase()) + " nº " + esc((S().orcamentos.find(function (o) { return o.id === d.orcamento_id; }) || {}).numero || "?") + ".</p>" : "") +
      '<div class="acoes"><button class="prim" id="os-salvar">Salvar</button>' + (novo ? "" : '<button type="button" id="os-campo">📍 Abrir como no celular</button><button type="button" id="os-doc">📄 Relatório / PDF</button>' +
        '<button type="button" class="zap" id="os-zap">Avisar no WhatsApp</button><button type="button" class="perigo" id="os-apagar">Apagar</button>') + "</div></form>" +
      (novo ? "" : '<div class="cartao" style="margin-top:14px"><h3>Andamento</h3><div id="os-and" style="margin-top:8px"><div class="mudo peq">Carregando...</div></div></div>'),
      { titulo: novo ? "Nova " + R("ordem").toLowerCase() : R("ordem") + " nº " + s.numero, larga: true });
    var el = j.el;
    $("#os-resp", el).value = d.responsavel || "";
    // a equipe pode ter mudado desde que o app abriu (alguém entrou pelo convite)
    sb().from("membros").select("*").order("criado_em").then(function (r) {
      if (r.error || !r.data) return;
      S().membros = r.data;
      var sel = $("#os-resp", el); if (!sel) return;
      var atual = sel.value;
      sel.innerHTML = '<option value="">— ninguém ainda —</option>' + r.data.filter(function (m) { return m.ativo || m.usuario === d.responsavel; })
        .map(function (m) { return '<option value="' + m.usuario + '">' + esc(m.nome || m.email) + "</option>"; }).join("");
      sel.value = atual;
    });
    $("#os-st", el).value = d.status || "aberta";
    $("#os-cli", el).onchange = function () {
      var c = S().clientes.find(function (x) { return x.nome.toLowerCase() === this.value.trim().toLowerCase(); }, this);
      if (c) { if (!$("#os-tel", el).value) $("#os-tel", el).value = c.telefone || ""; if (!$("#os-end", el).value) $("#os-end", el).value = [c.endereco, c.cidade].filter(Boolean).join(" — "); }
    };
    $("#os-data", el).onchange = function () { if (this.value && $("#os-st", el).value === "aberta") $("#os-st", el).value = "agendada"; };
    $("#f-os", el).onsubmit = function (ev) {
      ev.preventDefault();
      var b = $("#os-salvar", el), nomeC = $("#os-cli", el).value.trim();
      var c = S().clientes.find(function (x) { return x.nome.toLowerCase() === nomeC.toLowerCase(); });
      var maps = $("#os-maps", el).value.trim();
      if (maps && !/^https:\/\//i.test(maps)) { A.avisar("O link do mapa precisa começar com https://", "erro"); return; }
      var p = { titulo: A.maiuscula($("#os-tit", el).value.trim()), cliente_id: c ? c.id : null, cliente_nome: nomeC ? A.maiuscula(nomeC) : null,
        telefone: $("#os-tel", el).value.trim() || null, endereco: $("#os-end", el).value.trim() || null, maps_url: maps || null,
        descricao: $("#os-desc", el).value.trim() || null, data_prevista: $("#os-data", el).value || null, responsavel: $("#os-resp", el).value || null,
        status: $("#os-st", el).value };
      if (novo && d.orcamento_id) p.orcamento_id = d.orcamento_id;
      A.ocupado(b, true);
      (novo ? sb().from("servicos").insert(p) : sb().from("servicos").update(p).eq("id", s.id)).select().single().then(function (r) {
        if (r.error) throw r.error;
        atualizarLocal(r.data); A.avisar(novo ? R("ordem") + " nº " + r.data.numero + " criada." : "Salvo.", "ok"); j.fechar();
        if (novo && location.hash !== "#os") location.hash = "#os"; else X().irPara();   // ao gerar do orçamento, mostra a lista de ordens
      }).catch(function (e) { A.avisar(A.msgErro(e), "erro"); A.ocupado(b, false); });
    };
    if (novo) { $("#os-tit", el).focus(); return; }
    $("#os-campo", el).onclick = function () { j.fechar(); campo(s); };
    $("#os-doc", el).onclick = function () { relatorioDoc(s); };
    $("#os-zap", el).onclick = function () {
      var txt = "*" + R("ordem") + " nº " + s.numero + "*\n" + s.titulo + (s.data_prevista ? "\nData: " + dataCurta(s.data_prevista) : "") +
        (nomeCli(s) !== "—" ? "\n" + R("cliente") + ": " + nomeCli(s) : "") + (endDe(s) ? "\nEndereço: " + endDe(s) : "") + (s.maps_url ? "\nMapa: " + s.maps_url : "") +
        (s.descricao ? "\n\n" + s.descricao : "") + "\n\nAbra o AGEstor em “Meu dia” para registrar a chegada.";
      window.open(A.linkZap("", txt), "_blank", "noopener");  // a pessoa escolhe o contato no WhatsApp
    };
    $("#os-apagar", el).onclick = function () {
      A.confirmar("Apagar a " + R("ordem").toLowerCase() + " nº " + s.numero + " com fotos e relatório? Não dá para desfazer.", "Apagar").then(function (ok) {
        if (!ok) return;
        detalhes(s.id).then(function (dt) {
          var cams = dt.pontos.map(function (p) { return p.foto; }).concat(dt.rel && dt.rel.assinatura ? [dt.rel.assinatura] : []).filter(Boolean);
          return (cams.length ? sb().storage.from("fotos").remove(cams) : Promise.resolve()).then(function () { return sb().from("servicos").delete().eq("id", s.id); });
        }).then(function (r) {
          if (r && r.error) throw r.error;
          var l = S().servicos, i = l.findIndex(function (x) { return x.id === s.id; }); if (i >= 0) l.splice(i, 1); A.avisar("Apagada.", "ok"); j.fechar(); X().irPara();
        }).catch(function (e) { A.avisar(A.msgErro(e), "erro"); });
      });
    };
    detalhes(s.id).then(function (dt) {
      var rel = dt.rel, alvo = $("#os-and", el); if (!alvo) return;
      alvo.innerHTML = htmlPontos(dt.pontos) + (rel ? '<h3 style="margin:14px 0 6px">Relatório</h3>' + htmlRelatorio(rel) : "") + '<div id="os-comp"></div>';
      if (window.AG_COMPRAS && X().ligado("compras")) window.AG_COMPRAS.daOS(s.id).then(function (l) {
        var c = $("#os-comp", el); if (!c || !l.length) return;
        c.innerHTML = '<div class="aviso" style="background:var(--sup2);margin-top:12px">🧾 Material comprado para esta ordem: <b>' + A.dinheiro(l.reduce(function (t, x) { return t + Number(x.valor); }, 0)) +
          "</b> em " + l.length + " nota(s)</div>";
      });
    }).catch(function (e) { var a = $("#os-and", el); if (a) a.innerHTML = '<div class="aviso erro">' + esc(A.msgErro(e)) + "</div>"; });
  }
  function htmlRelatorio(rel) {
    return (rel.texto ? '<p style="white-space:pre-line;margin:0 0 8px">' + esc(rel.texto) + "</p>" : "") +
      (rel.materiais.length ? '<div class="peq"><b>Materiais usados:</b> ' + rel.materiais.map(function (m) { return esc(A.numero(m.qtd) + " " + m.un + " " + m.descricao); }).join(" · ") + "</div>" : "") +
      (rel.assinatura && urls[rel.assinatura] ? '<div style="margin-top:8px"><img alt="Assinatura" src="' + esc(urls[rel.assinatura]) + '" style="max-width:280px;width:100%;border:1px solid var(--borda);border-radius:8px;background:#fff"></div>' : "") +
      (rel.assinante ? '<div class="peq mudo">Assinado por ' + esc(rel.assinante) + "</div>" : "");
  }

  function gerarDeOrcamento(M) {
    var c = M.cliente_id && S().clientes.find(function (x) { return x.id === M.cliente_id; });
    var serv = (M.itens || []).filter(function (i) { return i.tipo !== "material" && String(i.descricao || "").trim(); });
    var mats = (M.itens || []).filter(function (i) { return i.tipo === "material" && String(i.descricao || "").trim(); });
    var desc = (serv.length ? serv.map(function (i) { return "• " + A.numero(i.qtd) + " " + i.un + " " + i.descricao; }).join("\n") : "") +
      (mats.length ? "\n\n" + R("materiais") + ":\n" + mats.map(function (i) { return "• " + A.numero(i.qtd) + " " + i.un + " " + i.descricao; }).join("\n") : "");
    editarOS(null, { titulo: M.titulo || (serv[0] && serv[0].descricao) || R("orcamento") + " nº " + M.numero, cliente_id: M.cliente_id, cliente_nome: M.cliente_nome,
      telefone: c ? c.telefone : "", endereco: c ? [c.endereco, c.cidade].filter(Boolean).join(" — ") : "", descricao: desc.trim(), orcamento_id: M.id });
  }

  // ---------- 📍 meu dia (app do funcionário) ----------
  function telaMeuDia(t) {
    var eu = S().user.id, h = hoje();
    var minhas = S().servicos.filter(function (s) { return s.responsavel === eu; });
    var abertas = minhas.filter(function (s) { return s.status !== "concluida" && s.status !== "cancelada"; })
      .sort(function (a, b) { return String(a.data_prevista || "9").localeCompare(String(b.data_prevista || "9")) || a.numero - b.numero; });
    var semana = Date.now() - 7 * A.DIA;
    var feitas = minhas.filter(function (s) { return s.status === "concluida" && new Date(s.concluida_em) > semana; });
    var nome = (S().membro.nome || "").split(" ")[0];
    t.innerHTML = X().avisoSituacao() + '<h2 style="margin-bottom:4px">' + (nome ? esc(nome) + ", s" : "S") + "eu dia</h2>" +
      '<p class="mudo" style="margin-top:0">' + new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }) + "</p>" +
      '<div class="lista" id="lst-ab"></div>' +
      '<div class="acoes"><button id="b-outra">+ Serviço que não estava na lista</button></div>' +
      (feitas.length ? '<h3 style="margin:18px 0 8px">Concluídas nos últimos 7 dias</h3><div class="lista" id="lst-ok"></div>' : "");
    listaOS($("#lst-ab"), abertas, campo);
    if (!abertas.length) $("#lst-ab").innerHTML = '<div class="vazio">Nenhum serviço para você agora. 🎉' + (gestor() ? '<br><a href="#os">Ver todas as ' + esc(R("ordens").toLowerCase()) + "</a>" : "") + "</div>";
    if (feitas.length) listaOS($("#lst-ok"), feitas, campo);
    $("#b-outra").onclick = function () { novaMinha(); };
    // destaca o que é de hoje
    $$("#lst-ab .item").forEach(function (b) { var s = S().servicos.find(function (x) { return x.id === b.dataset.id; }); if (s && s.data_prevista === h) b.style.borderLeft = "4px solid var(--prim)"; });
  }
  function novaMinha() {
    var j = A.janela('<p class="peq mudo">Para quando você chegar num serviço que não foi cadastrado. Fica com você e o escritório vê.</p>' +
      '<label for="nm-tit">O que vai fazer *</label><input id="nm-tit" maxlength="200" required>' +
      '<label for="nm-cli">' + esc(R("cliente")) + ' / local</label><input id="nm-cli" maxlength="160">' +
      '<label for="nm-end">Endereço</label><input id="nm-end" maxlength="250">' +
      '<div class="acoes"><button class="prim" id="nm-ok">Criar e abrir</button></div>', { titulo: "Serviço novo" });
    $("#nm-ok", j.el).onclick = function () {
      var b = this, tit = $("#nm-tit", j.el).value.trim();
      if (!tit) { A.avisar("Diga o que vai fazer.", "erro"); return; }
      A.ocupado(b, true);
      sb().from("servicos").insert({ titulo: A.maiuscula(tit), cliente_nome: A.maiuscula($("#nm-cli", j.el).value.trim()) || null, endereco: $("#nm-end", j.el).value.trim() || null,
        responsavel: S().user.id, data_prevista: hoje() }).select().single().then(function (r) {
        if (r.error) throw r.error; atualizarLocal(r.data); j.fechar(); X().irPara(); campo(r.data);
      }).catch(function (e) { A.avisar(A.msgErro(e), "erro"); A.ocupado(b, false); });
    };
  }

  // tela "no celular": dados do local + botões grandes
  function campo(s) {
    var encerrada = s.status === "concluida" || s.status === "cancelada", tel = telDe(s), end = endDe(s);
    var j = A.janela('<div class="campo-info"><div class="forte" style="font-size:18px">' + esc(s.titulo) + '</div><div class="mudo">' + esc(nomeCli(s)) + "</div>" +
      (end ? "<div>" + esc(end) + "</div>" : "") + (s.data_prevista ? '<div class="peq mudo">Data: ' + dataCurta(s.data_prevista) + "</div>" : "") +
      (s.descricao ? '<div class="aviso" style="white-space:pre-line;background:var(--sup2)">' + esc(s.descricao) + "</div>" : "") +
      '<div class="acoes">' + (end || s.maps_url ? '<a class="botao" target="_blank" rel="noopener" href="' + esc(A.linkRota(end, s.maps_url)) + '">🧭 Como chegar</a>' : "") +
      (tel ? '<a class="botao" href="tel:' + esc(A.soDigitos(tel)) + '">📞 Ligar</a><a class="botao zap" target="_blank" rel="noopener" href="' + esc(A.linkZap(tel, "Olá! Aqui é da " + S().empresa.nome + ".")) + '">WhatsApp</a>' : "") +
      "</div></div>" +
      (encerrada ? '<div class="aviso ok">Esta ' + esc(R("ordem").toLowerCase()) + " está " + ST[s.status][0].toLowerCase() + ".</div>" :
        '<div class="botoes-campo"><button class="prim" data-p="chegada">📍 Cheguei</button><button data-p="foto">📷 Foto</button><button data-p="saida">🏁 Saí</button>' +
        '<button class="dest" id="c-rel">📝 Relatório e assinatura</button></div>') +
      '<h3 style="margin:16px 0 8px">Registros</h3><div id="c-pts"><div class="mudo peq">Carregando...</div></div>' +
      '<div class="acoes"><button id="c-doc">📄 Ver relatório / PDF</button><button id="c-fechar">Fechar</button></div>',
      { titulo: R("ordem") + " nº " + s.numero, larga: true });
    var el = j.el;
    function recarregar() {
      return detalhes(s.id).then(function (dt) { var a = $("#c-pts", el); if (a) a.innerHTML = htmlPontos(dt.pontos) + (dt.rel ? '<h3 style="margin:14px 0 6px">Relatório</h3>' + htmlRelatorio(dt.rel) : ""); return dt; })
        .catch(function (e) { var a = $("#c-pts", el); if (a) a.innerHTML = '<div class="aviso erro">' + esc(A.msgErro(e)) + "</div>"; });
    }
    $$("[data-p]", el).forEach(function (b) { b.onclick = function () { registrar(s, b.dataset.p, function () { recarregarOS(s.id).then(function (n) { s = n; }); recarregar(); }); }; });
    var br = $("#c-rel", el);
    if (br) br.onclick = function () {
      detalhes(s.id).then(function (dt) {
        relatorio(s, dt.rel, function (concluiu) {
          recarregarOS(s.id).then(function (n) { s = n; if (concluiu) { j.fechar(); X().irPara(); A.avisar(R("ordem") + " concluída. Bom trabalho!", "ok"); } else recarregar(); });
        });
      }).catch(function (e) { A.avisar(A.msgErro(e), "erro"); });
    };
    $("#c-doc", el).onclick = function () { relatorioDoc(s); };
    $("#c-fechar", el).onclick = function () { j.fechar(); };
    recarregar();
  }

  function registrar(s, tipo, depois) {
    if (!X().podeGravar()) { A.avisar(A.msgErro({ message: "row-level security" }), "erro"); return; }
    var precisaFoto = tipo === "foto", blob = null;
    var j = A.janela('<p class="peq mudo">A hora vem do servidor e a localização do seu celular.' + (tipo === "chegada" ? " Uma foto da fachada ou do local ajuda." : "") + "</p>" +
      '<label class="botao" for="rg-foto" style="color:var(--texto)">📷 ' + (precisaFoto ? "Tirar foto" : "Tirar foto (opcional)") + '</label><input id="rg-foto" type="file" accept="image/*" capture="environment" class="oculto">' +
      '<img id="rg-prev" class="oculto" alt="Foto" style="width:100%;max-height:260px;object-fit:contain;border-radius:12px;margin-top:10px;background:var(--sup2)">' +
      '<label for="rg-obs">Observação</label><input id="rg-obs" maxlength="500" placeholder="' + (tipo === "saida" ? "Ex.: volto amanhã para terminar" : "Opcional") + '">' +
      '<div class="acoes"><button class="prim" id="rg-ok">Registrar ' + TIPO[tipo].split(" ")[1].toLowerCase() + "</button></div>", { titulo: TIPO[tipo] });
    var el = j.el;
    $("#rg-foto", el).onchange = function () {
      var f = this.files && this.files[0]; if (!f) return;
      A.reduzirFoto(f, 1600).then(function (b) { blob = b; var p = $("#rg-prev", el); p.src = URL.createObjectURL(b); p.classList.remove("oculto"); })
        .catch(function (e) { A.avisar(A.msgErro(e), "erro"); });
    };
    $("#rg-ok", el).onclick = function () {
      var b = this;
      if (precisaFoto && !blob) { A.avisar("Tire a foto primeiro.", "erro"); return; }
      A.ocupado(b, true, "Pegando a localização...");
      A.posicao().then(function (pos) {
        if (!pos) return A.confirmar("Não consegui a localização (GPS desligado ou sem permissão). Registrar mesmo assim? O escritório vai ver “sem GPS”.", "Registrar").then(function (ok) { if (!ok) throw null; return null; });
        return pos;
      }).then(function (pos) {
        A.ocupado(b, false); A.ocupado(b, true, blob ? "Enviando a foto..." : "Registrando...");
        return (blob ? enviarImagem(s.id, blob) : Promise.resolve(null)).then(function (cam) {
          return sb().rpc("registrar_ponto", { p_servico: s.id, p_tipo: tipo, p_lat: pos ? pos.lat : null, p_lng: pos ? pos.lng : null, p_precisao: pos ? pos.precisao : null,
            p_foto: cam, p_obs: $("#rg-obs", el).value.trim() || null });
        });
      }).then(function (r) {
        if (r.error) throw r.error;
        A.avisar(TIPO[tipo] + " registrada às " + A.hora(r.data.criado_em) + ".", "ok"); j.fechar(); if (depois) depois();
      }).catch(function (e) { if (e) A.avisar(A.msgErro(e), "erro"); A.ocupado(b, false); });
    };
  }

  // quadro de assinatura com o dedo
  function quadroAssinatura(cv) {
    var cx = cv.getContext("2d"), tracos = [], atual = null;
    function ajustar() {
      var r = cv.getBoundingClientRect(), k = window.devicePixelRatio || 1; if (!r.width) return;
      cv.width = Math.round(r.width * k); cv.height = Math.round(r.height * k); cx.setTransform(k, 0, 0, k, 0, 0); desenhar();
    }
    function riscar(c) {
      c.lineWidth = 2.6; c.lineCap = "round"; c.lineJoin = "round"; c.strokeStyle = "#0d1b33";
      tracos.forEach(function (t) { c.beginPath(); t.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); if (t.length === 1) c.lineTo(t[0][0] + 0.1, t[0][1] + 0.1); c.stroke(); });
    }
    function desenhar() { var r = cv.getBoundingClientRect(); cx.clearRect(0, 0, r.width, r.height); riscar(cx); }
    function ponto(ev) { var r = cv.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
    cv.addEventListener("pointerdown", function (ev) { ev.preventDefault(); if (cv.setPointerCapture) cv.setPointerCapture(ev.pointerId); atual = [ponto(ev)]; tracos.push(atual); desenhar(); });
    cv.addEventListener("pointermove", function (ev) { if (!atual) return; ev.preventDefault(); atual.push(ponto(ev)); desenhar(); });
    function soltar() { atual = null; }
    cv.addEventListener("pointerup", soltar); cv.addEventListener("pointercancel", soltar);
    setTimeout(ajustar, 0);
    return {
      vazio: function () { return !tracos.some(function (t) { return t.length > 1; }); },
      limpar: function () { tracos = []; desenhar(); },
      // JPEG com fundo branco e o carimbo de quem assinou e quando
      paraJpeg: function (linhas) {
        var r = cv.getBoundingClientRect(), k = Math.max(1, 900 / r.width), w = Math.round(r.width * k), hA = Math.round(r.height * k), fs = 22, hT = linhas.length * fs * 1.4 + 16;
        var out = document.createElement("canvas"); out.width = w; out.height = hA + hT;
        var c = out.getContext("2d"); c.fillStyle = "#fff"; c.fillRect(0, 0, w, out.height); c.scale(k, k); riscar(c); c.setTransform(1, 0, 0, 1, 0, 0);
        c.fillStyle = "#f1f3f6"; c.fillRect(0, hA, w, hT); c.fillStyle = "#222"; c.textBaseline = "top";
        linhas.forEach(function (l, i) { c.font = (i ? "" : "bold ") + fs + "px sans-serif"; c.fillText(l, 12, hA + 8 + i * fs * 1.4, w - 24); });
        return new Promise(function (ok, erro) { out.toBlob(function (b) { b ? ok(b) : erro(new Error("Não consegui preparar a assinatura.")); }, "image/jpeg", 0.9); });
      }
    };
  }

  function relatorio(s, rel, depois) {
    var mats = rel && rel.materiais.length ? rel.materiais.map(function (m) { return { descricao: m.descricao, qtd: m.qtd, un: m.un }; }) : [{ descricao: "", qtd: 1, un: "un" }];
    var cat = S().catalogo.filter(function (i) { return i.tipo === "material"; }).map(function (i) { return '<option value="' + esc(i.descricao) + '">'; }).join("");
    var temAss = rel && rel.assinatura && urls[rel.assinatura];
    var j = A.janela('<datalist id="dl-mat">' + cat + "</datalist>" +
      '<label for="rl-txt">O que foi feito</label><textarea id="rl-txt" rows="4" maxlength="5000" placeholder="Ex.: Troquei 2 disjuntores de 20 A e reapertei as conexões do quadro.">' + esc(rel ? rel.texto || "" : "") + "</textarea>" +
      '<h3 style="margin:14px 0 6px">' + esc(R("materiais")) + ' usados</h3><div id="rl-mats" class="itens-orc"></div><div class="acoes" style="margin-top:6px"><button type="button" id="rl-add">+ ' + esc(R("material")) + "</button></div>" +
      '<h3 style="margin:14px 0 6px">Assinatura do ' + esc(R("cliente").toLowerCase()) + "</h3>" +
      (temAss ? '<div id="rl-ass-v"><img alt="Assinatura" src="' + esc(urls[rel.assinatura]) + '" style="max-width:100%;border:1px solid var(--borda);border-radius:8px;background:#fff"><div class="acoes"><button type="button" id="rl-nova">Assinar de novo</button></div></div>' : "") +
      '<div id="rl-ass-q"' + (temAss ? ' class="oculto"' : "") + '><canvas id="rl-cv" class="assinatura" aria-label="Quadro de assinatura"></canvas><div class="linha"><span class="peq mudo">Assine com o dedo</span><button type="button" class="texto dir" id="rl-limpar">Limpar</button></div></div>' +
      '<label for="rl-nome">Nome de quem assinou</label><input id="rl-nome" maxlength="120" value="' + esc(rel ? rel.assinante || "" : nomeCli(s) !== "—" ? nomeCli(s) : "") + '">' +
      '<div class="acoes"><button id="rl-salvar">Salvar</button><button class="prim" id="rl-concluir">✅ Salvar e concluir</button></div>', { titulo: "Relatório · nº " + s.numero, larga: true, fixa: true });
    var el = j.el, quadro = null;
    function iniciarQuadro() { if (!quadro) quadro = quadroAssinatura($("#rl-cv", el)); }
    if (!temAss) iniciarQuadro();
    var nv = $("#rl-nova", el); if (nv) nv.onclick = function () { $("#rl-ass-v", el).classList.add("oculto"); $("#rl-ass-q", el).classList.remove("oculto"); temAss = false; iniciarQuadro(); };
    $("#rl-limpar", el).onclick = function () { if (quadro) quadro.limpar(); };
    function desenharMats() {
      var box = $("#rl-mats", el);
      box.innerHTML = mats.map(function (m, k) {
        return '<div class="linha-mat" data-k="' + k + '"><input class="desc" list="dl-mat" maxlength="200" placeholder="Material" aria-label="Material" value="' + esc(m.descricao) + '">' +
          '<input class="qtd" inputmode="decimal" aria-label="Quantidade" value="' + esc(A.numero(m.qtd)) + '"><input class="un" maxlength="10" aria-label="Unidade" value="' + esc(m.un) + '">' +
          '<button type="button" class="tirar" aria-label="Tirar">✕</button></div>';
      }).join("");
      $$(".linha-mat", box).forEach(function (row) {
        var m = mats[Number(row.dataset.k)];
        $(".desc", row).oninput = function () { m.descricao = this.value; };
        $(".desc", row).onchange = function () {
          var c = S().catalogo.find(function (x) { return x.descricao.toLowerCase() === this.value.trim().toLowerCase(); }, this);
          if (c) { m.un = c.un; $(".un", row).value = c.un; }
        };
        $(".qtd", row).oninput = function () { m.qtd = A.lerNumero(this.value); };
        $(".un", row).oninput = function () { m.un = this.value.trim() || "un"; };
        $(".tirar", row).onclick = function () { mats.splice(Number(row.dataset.k), 1); if (!mats.length) mats.push({ descricao: "", qtd: 1, un: "un" }); desenharMats(); };
      });
    }
    desenharMats();
    $("#rl-add", el).onclick = function () { mats.push({ descricao: "", qtd: 1, un: "un" }); desenharMats(); var l = $$(".linha-mat .desc", el); l[l.length - 1].focus(); };
    function salvar(concluir, b) {
      var nome = $("#rl-nome", el).value.trim(), texto = $("#rl-txt", el).value.trim();
      var assinou = quadro && !temAss && !quadro.vazio();
      if (concluir && !texto) { A.avisar("Escreva o que foi feito antes de concluir.", "erro"); $("#rl-txt", el).focus(); return; }
      if (assinou && !nome) { A.avisar("Escreva o nome de quem assinou.", "erro"); $("#rl-nome", el).focus(); return; }
      A.ocupado(b, true, "Salvando...");
      var agora = new Date();
      (assinou ? quadro.paraJpeg([nome, agora.toLocaleDateString("pt-BR") + " " + A.hora(agora) + " · " + R("ordem") + " nº " + s.numero + " · " + S().empresa.nome])
        .then(function (blob) { return enviarImagem(s.id, blob); }) : Promise.resolve(null)).then(function (cam) {
        return sb().rpc("salvar_relatorio", { p_servico: s.id, p: { texto: texto, assinante: nome || null, assinatura: cam,
          materiais: mats.filter(function (m) { return String(m.descricao || "").trim(); }).map(function (m) { return { descricao: A.maiuscula(m.descricao.trim()), qtd: Number(m.qtd) || 1, un: m.un || "un" }; }) },
          p_concluir: !!concluir });
      }).then(function (r) {
        if (r.error) throw r.error;
        A.avisar(concluir ? "Relatório salvo." : "Relatório salvo. Conclua quando terminar.", "ok"); j.fechar(); if (depois) depois(!!concluir);
      }).catch(function (e) { A.avisar(A.msgErro(e), "erro"); A.ocupado(b, false); });
    }
    $("#rl-salvar", el).onclick = function () { salvar(false, this); };
    $("#rl-concluir", el).onclick = function () { salvar(true, this); };
  }

  // ---------- 📄 relatório para o cliente (imprimir / PDF / WhatsApp) ----------
  function relatorioDoc(s) {
    detalhes(s.id).then(function (dt) {
      var e = S().empresa, pts = dt.pontos, rel = dt.rel, c = clienteDe(s);
      var cheg = pts.filter(function (p) { return p.tipo === "chegada"; })[0], said = pts.filter(function (p) { return p.tipo === "saida"; }).slice(-1)[0];
      var fotos = pts.filter(function (p) { return p.foto && urls[p.foto]; });
      var equipe = [];
      pts.forEach(function (p) { var n = nomePessoa(p.usuario); if (equipe.indexOf(n) < 0) equipe.push(n); });
      var f = document.createElement("div"); f.className = "doc-fundo";
      f.innerHTML = '<div class="doc-barra"><button class="prim" id="d-imp">🖨️ Imprimir / Salvar PDF</button><button class="zap" id="d-zap">WhatsApp</button><button id="d-fechar">Fechar</button></div>' +
        '<div class="doc" style="--doc-cor:' + esc(e.cor1) + '"><div class="doc-cab">' + (e.logo ? '<img alt="" src="' + esc(e.logo) + '">' : "") +
        '<div class="emp"><h1>' + esc(e.nome) + "</h1><div>" + esc([e.cnpj ? "CNPJ " + e.cnpj : "", e.cidade].filter(Boolean).join(" · ")) + "</div><div>" + esc([e.whatsapp, e.email].filter(Boolean).join(" · ")) + "</div></div>" +
        '<div class="num">RELATÓRIO DE SERVIÇO<b>nº ' + s.numero + "</b>" + (s.concluida_em ? "Concluído em " + A.data(s.concluida_em) : ST[s.status][0]) + "</div></div>" +
        "<h3>" + esc(R("cliente")) + "</h3><div><b>" + esc(nomeCli(s)) + "</b>" + (endDe(s) ? "<br>" + esc(endDe(s)) : "") + (c && c.documento ? "<br>" + esc(c.documento) : "") + "</div>" +
        "<h3>Serviço</h3><div><b>" + esc(s.titulo) + "</b>" + (s.descricao ? '<div class="cond" style="margin-top:4px">' + esc(s.descricao) + "</div>" : "") + "</div>" +
        (cheg || said ? "<h3>Atendimento</h3><div>" + (cheg ? "Chegada: " + A.data(cheg.criado_em) + " às " + A.hora(cheg.criado_em) : "") + (said ? (cheg ? " · " : "") + "Saída: " + A.data(said.criado_em) + " às " + A.hora(said.criado_em) : "") +
          (equipe.length ? "<br>Equipe: " + esc(equipe.join(", ")) : "") + "</div>" : "") +
        (rel && rel.texto ? '<h3>O que foi feito</h3><div class="cond">' + esc(rel.texto) + "</div>" : "") +
        (rel && rel.materiais.length ? "<h3>" + esc(R("materiais")) + ' usados</h3><table><thead><tr><th>Descrição</th><th class="n">Qtd</th><th>Un</th></tr></thead><tbody>' +
          rel.materiais.map(function (m) { return "<tr><td>" + esc(m.descricao) + '</td><td class="n">' + esc(A.numero(m.qtd)) + "</td><td>" + esc(m.un) + "</td></tr>"; }).join("") + "</tbody></table>" : "") +
        (fotos.length ? '<h3>Fotos</h3><div class="doc-fotos">' + fotos.map(function (p) {
          return '<figure><img alt="" src="' + esc(urls[p.foto]) + '"><figcaption>' + TIPO[p.tipo].split(" ")[1] + " · " + A.data(p.criado_em) + " " + A.hora(p.criado_em) + (p.obs ? " · " + esc(p.obs) : "") + "</figcaption></figure>";
        }).join("") + "</div>" : "") +
        (rel && rel.assinatura && urls[rel.assinatura] ? '<h3>Assinatura do ' + esc(R("cliente").toLowerCase()) + '</h3><img alt="Assinatura" src="' + esc(urls[rel.assinatura]) + '" style="max-width:320px;width:100%">' : "") +
        '<div class="rod">' + (S().cfg.orcamento.rodape ? esc(S().cfg.orcamento.rodape) + "<br>" : "") + "Feito com AGEstor</div></div>";
      document.body.appendChild(f);
      function fechar() { f.remove(); document.body.classList.remove("imprimindo"); }
      $("#d-fechar", f).onclick = fechar;
      $("#d-imp", f).onclick = function () {
        document.body.classList.add("imprimindo");
        var antes = document.title; document.title = "Relatório " + s.numero + " - " + nomeCli(s);
        setTimeout(function () { window.print(); document.title = antes; document.body.classList.remove("imprimindo"); }, 50);
      };
      $("#d-zap", f).onclick = function () {
        var l = ["*Relatório de serviço nº " + s.numero + " — " + e.nome + "*", s.titulo];
        if (cheg) l.push("Chegada: " + A.data(cheg.criado_em) + " " + A.hora(cheg.criado_em));
        if (said) l.push("Saída: " + A.data(said.criado_em) + " " + A.hora(said.criado_em));
        if (rel && rel.texto) l.push("", rel.texto);
        if (rel && rel.materiais.length) l.push("", R("materiais") + ": " + rel.materiais.map(function (m) { return A.numero(m.qtd) + " " + m.un + " " + m.descricao; }).join("; "));
        if (s.status === "concluida") l.push("", "✅ Serviço concluído" + (s.concluida_em ? " em " + A.data(s.concluida_em) : "") + ".");
        window.open(A.linkZap(telDe(s), l.join("\n")), "_blank", "noopener");
      };
    }).catch(function (e) { A.avisar(A.msgErro(e), "erro"); });
  }

  window.AG_OS = { telaOS: telaOS, telaMeuDia: telaMeuDia, gerarDeOrcamento: gerarDeOrcamento, editarOS: editarOS, campo: campo };
})();
