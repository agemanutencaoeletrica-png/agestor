// AGEstor — 💰 pagamentos da equipe: lê o comprovante (foto, PDF, texto ou Ctrl+V), confere, guarda com o comprovante
// e faz o fechamento de cada pessoa por semana, quinzena ou mês (dias trabalhados pelo "Meu dia" × diária).
(function () {
  "use strict";
  var A = window.AG, esc = A.esc, $ = A.$, $$ = A.$$;
  var X = function () { return window.AGX; };
  var L = function () { return window.AG_LEITOR; };
  var TIPOS = { diaria: "Diária", salario: "Salário", adiantamento: "Adiantamento", vale: "Vale", reembolso: "Reembolso (material, combustível)", outro: "Outro" };
  var FORMAS = { pix: "Pix", dinheiro: "💵 Dinheiro", transferencia: "Transferência", outro: "Outro" };
  var PERIODOS = { sem: "Esta semana", "sem-1": "Semana passada", qui: "Esta quinzena", "qui-1": "Quinzena passada", mes: "Este mês", "mes-1": "Mês passado", per: "Escolher datas" };
  var GRUPOS = { semana: "Por semana", quinzena: "Por quinzena", mes: "Por mês" };
  var F = { periodo: "qui", grupo: "semana", pessoa: "", de: "", ate: "" };
  var D = { pessoas: [], pags: [], chegadas: [] };
  var urls = {}, telaAtual = null;

  function S() { return X().S(); }
  function sb() { return X().sb(); }
  function dois(n) { return String(n).padStart(2, "0"); }
  function iso(d) { return d.getFullYear() + "-" + dois(d.getMonth() + 1) + "-" + dois(d.getDate()); }
  function diaLocal(v) { return iso(new Date(v)); }
  function dataBR(s) { var p = String(s).slice(0, 10).split("-"); return p[2] + "/" + p[1] + "/" + p[0]; }
  function inicioSemana(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
  function somar(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }

  // período escolhido -> [início, fim) em datas locais
  function intervalo() {
    var h = new Date(); h.setHours(0, 0, 0, 0);
    var p = F.periodo, ini, fim;
    if (p === "sem" || p === "sem-1") { ini = inicioSemana(h); if (p === "sem-1") ini = somar(ini, -7); fim = somar(ini, 7); }
    else if (p === "qui" || p === "qui-1") {
      var y = h.getFullYear(), m = h.getMonth(), q = h.getDate() <= 15 ? 1 : 2;
      if (p === "qui-1") { if (q === 2) q = 1; else { q = 2; m -= 1; if (m < 0) { m = 11; y -= 1; } } }
      ini = new Date(y, m, q === 1 ? 1 : 16); fim = q === 1 ? new Date(y, m, 16) : new Date(y, m + 1, 1);
    } else if (p === "mes" || p === "mes-1") { ini = new Date(h.getFullYear(), h.getMonth() - (p === "mes-1" ? 1 : 0), 1); fim = new Date(ini.getFullYear(), ini.getMonth() + 1, 1); }
    else {
      ini = F.de ? new Date(F.de + "T00:00:00") : somar(h, -30);
      fim = F.ate ? somar(new Date(F.ate + "T00:00:00"), 1) : somar(h, 1);
    }
    return { ini: ini, fim: fim };
  }
  function chaveGrupo(v) {
    var d = new Date(v);
    if (F.grupo === "semana") return iso(inicioSemana(d));
    if (F.grupo === "quinzena") return d.getFullYear() + "-" + dois(d.getMonth() + 1) + (d.getDate() <= 15 ? "-1" : "-2");
    return d.getFullYear() + "-" + dois(d.getMonth() + 1);
  }
  function rotuloGrupo(k) {
    var MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    if (F.grupo === "semana") return "Semana de " + dataBR(k).slice(0, 5) + " a " + A.data(somar(new Date(k + "T12:00:00"), 6));
    var p = k.split("-"), mes = MES[Number(p[1]) - 1] + "/" + p[0];
    if (F.grupo === "quinzena") return (p[2] === "1" ? "1ª quinzena (1 a 15)" : "2ª quinzena (16 ao fim)") + " de " + mes;
    return mes.charAt(0).toUpperCase() + mes.slice(1);
  }
  function nomePessoa(id) { var p = D.pessoas.find(function (x) { return x.id === id; }); return p ? p.nome : "Sem pessoa"; }
  function soma(l) { return l.reduce(function (t, p) { return t + Number(p.valor); }, 0); }

  // ---------- dados ----------
  function carregar() {
    var r = intervalo();
    return Promise.all([
      sb().from("pessoas").select("*").order("nome"),
      sb().from("pagamentos").select("*").gte("pago_em", r.ini.toISOString()).lt("pago_em", r.fim.toISOString()).order("pago_em", { ascending: false }).limit(3000),
      sb().from("pontos").select("usuario,criado_em").eq("tipo", "chegada").gte("criado_em", r.ini.toISOString()).lt("criado_em", r.fim.toISOString()).limit(10000)
    ]).then(function (x) {
      x.forEach(function (y) { if (y.error) throw y.error; });
      D.pessoas = x[0].data; D.pags = x[1].data; D.chegadas = x[2].data || [];
    });
  }
  function diasTrabalhados(pessoa) {
    if (!pessoa || !pessoa.usuario) return null;
    var dias = {};
    D.chegadas.forEach(function (c) { if (c.usuario === pessoa.usuario) dias[diaLocal(c.criado_em)] = 1; });
    return Object.keys(dias).sort();
  }
  function fechamento(pessoa, pags) {
    var meus = pags.filter(function (p) { return p.pessoa_id === (pessoa ? pessoa.id : null); });
    var dias = diasTrabalhados(pessoa), previsto = dias && pessoa.diaria ? dias.length * Number(pessoa.diaria) : null;
    var pago = soma(meus.filter(function (p) { return p.tipo === "diaria" || p.tipo === "salario" || p.tipo === "outro"; }));
    var adiant = soma(meus.filter(function (p) { return p.tipo === "adiantamento" || p.tipo === "vale"; }));
    var reemb = soma(meus.filter(function (p) { return p.tipo === "reembolso"; }));
    return { pags: meus, dias: dias, previsto: previsto, pago: pago, adiant: adiant, reemb: reemb, total: soma(meus),
      saldo: previsto === null ? null : Math.round((previsto - pago - adiant) * 100) / 100 };
  }

  // ---------- tela ----------
  function tela(t) {
    telaAtual = t;
    t.innerHTML = X().avisoSituacao() + '<div class="linha" style="margin-bottom:10px"><h2>Pagamentos</h2><div class="dir linha">' +
      '<button class="peq" id="pg-pessoas">👥 Pessoas</button></div></div>' +
      '<div class="cartao"><div class="acoes" style="margin-top:0"><button class="prim" id="pg-arq-b">📎 Ler comprovantes</button><button id="pg-colar">📋 Colar texto</button>' +
      '<button id="pg-din">💵 Pagamento em dinheiro</button></div><input id="pg-arq" type="file" multiple accept="image/*,application/pdf,.pdf,.txt,text/plain" class="oculto">' +
      '<p class="peq mudo" style="margin-bottom:0">Foto ou PDF do comprovante do banco (pode escolher vários). No computador também dá para copiar a imagem e apertar <b>Ctrl+V</b> aqui.</p></div>' +
      '<div class="tres"><div><label for="pg-per">Período</label><select id="pg-per">' + Object.keys(PERIODOS).map(function (k) { return '<option value="' + k + '">' + PERIODOS[k] + "</option>"; }).join("") + "</select></div>" +
      '<div><label for="pg-grp">Mostrar</label><select id="pg-grp">' + Object.keys(GRUPOS).map(function (k) { return '<option value="' + k + '">' + GRUPOS[k] + "</option>"; }).join("") + "</select></div>" +
      '<div><label for="pg-pes">Pessoa</label><select id="pg-pes"></select></div></div>' +
      '<div class="duas' + (F.periodo === "per" ? "" : " oculto") + '" id="pg-datas"><div><label for="pg-de">De</label><input id="pg-de" type="date" value="' + esc(F.de) + '"></div>' +
      '<div><label for="pg-ate">Até</label><input id="pg-ate" type="date" value="' + esc(F.ate) + '"></div></div>' +
      '<div id="pg-res" style="margin-top:14px"><div class="vazio">Carregando...</div></div>';
    $("#pg-per").value = F.periodo; $("#pg-grp").value = F.grupo;
    $("#pg-per").onchange = function () { F.periodo = this.value; $("#pg-datas").classList.toggle("oculto", F.periodo !== "per"); atualizar(); };
    $("#pg-grp").onchange = function () { F.grupo = this.value; desenhar(); };
    $("#pg-pes").onchange = function () { F.pessoa = this.value; desenhar(); };
    $("#pg-de").onchange = function () { F.de = this.value; atualizar(); };
    $("#pg-ate").onchange = function () { F.ate = this.value; atualizar(); };
    $("#pg-pessoas").onclick = pessoas;
    $("#pg-arq-b").onclick = function () { $("#pg-arq").value = ""; $("#pg-arq").click(); };
    $("#pg-arq").onchange = function () { var fs = Array.prototype.slice.call(this.files || []); if (fs.length) receber({ arquivos: fs }); };
    $("#pg-colar").onclick = function () {
      var j = A.janela('<p class="peq mudo">No app do banco, use “Compartilhar comprovante” → copiar texto, e cole aqui. Pode colar vários de uma vez, separados por uma linha em branco dupla.</p>' +
        '<textarea id="pg-txt" rows="10"></textarea><div class="acoes"><button class="prim" id="pg-ler">Ler</button></div>', { titulo: "Colar comprovante" });
      $("#pg-ler", j.el).onclick = function () { var tx = $("#pg-txt", j.el).value; j.fechar(); if (tx.trim()) receber({ textos: tx.split(/\n\s*\n\s*\n/).filter(function (x) { return x.trim(); }) }); };
    };
    $("#pg-din").onclick = function () { receber({ especie: true }); };
    atualizar();
  }
  // Ctrl+V de uma imagem com a aba de pagamentos aberta
  document.addEventListener("paste", function (ev) {
    if (!telaAtual || !document.body.contains(telaAtual) || $(".fundo-modal")) return;
    var fs = Array.prototype.slice.call((ev.clipboardData && ev.clipboardData.files) || []).filter(function (f) { return /^image\/|pdf/.test(f.type); });
    var tx = ev.clipboardData && ev.clipboardData.getData("text");
    if (fs.length) { ev.preventDefault(); receber({ arquivos: fs }); }
    else if (tx && /R\$\s*\d/.test(tx) && !/INPUT|TEXTAREA/.test((document.activeElement || {}).tagName)) { ev.preventDefault(); receber({ textos: [tx] }); }
  });

  function atualizar() {
    var r = $("#pg-res"); if (!r) return;
    carregar().then(desenhar).catch(function (e) { r.innerHTML = '<div class="aviso erro">' + esc(A.msgErro(e)) + "</div>"; });
  }
  function desenhar() {
    var r = $("#pg-res"); if (!r) return;
    var sel = $("#pg-pes"), at = F.pessoa;
    sel.innerHTML = '<option value="">Todas as pessoas</option>' + D.pessoas.map(function (p) { return '<option value="' + p.id + '">' + esc(p.nome) + (p.ativo ? "" : " (saiu)") + "</option>"; }).join("");
    sel.value = D.pessoas.some(function (p) { return p.id === at; }) ? at : (F.pessoa = "");
    var pags = D.pags.filter(function (p) { return !F.pessoa || p.pessoa_id === F.pessoa; });
    var it = intervalo(), pix = soma(pags.filter(function (p) { return p.forma !== "dinheiro"; })), din = soma(pags.filter(function (p) { return p.forma === "dinheiro"; }));
    // fechamento por pessoa
    var ids = {};
    pags.forEach(function (p) { ids[p.pessoa_id || ""] = 1; });
    D.pessoas.forEach(function (p) { if (p.ativo && (!F.pessoa || p.id === F.pessoa) && (diasTrabalhados(p) || []).length) ids[p.id] = 1; });
    var linhas = Object.keys(ids).map(function (id) { var p = D.pessoas.find(function (x) { return x.id === id; }) || null; return { p: p, f: fechamento(p, pags) }; })
      .sort(function (a, b) { return (a.p ? a.p.nome : "~").localeCompare(b.p ? b.p.nome : "~", "pt-BR"); });
    var grupos = {};
    pags.forEach(function (p) { var k = chaveGrupo(p.pago_em); (grupos[k] = grupos[k] || []).push(p); });
    if (!D.pessoas.length && !pags.length) {
      r.innerHTML = '<div class="cartao"><h3>Comece cadastrando quem recebe</h3><p class="mudo">Funcionários com acesso ao app e diaristas. Com a chave Pix cadastrada o app reconhece o comprovante sozinho, e com a diária ele calcula o fechamento pelos dias registrados no “Meu dia”.</p>' +
        '<div class="acoes"><button class="prim" id="pg-comecar">👥 Cadastrar pessoas</button></div></div>';
      $("#pg-comecar").onclick = pessoas; return;
    }
    r.innerHTML = '<div class="grade"><div class="ladrilho"><div class="r">Total pago</div><div class="v">' + A.dinheiro(pix + din) + '</div><div class="d">' + A.data(it.ini) + " a " + A.data(somar(it.fim, -1)) + "</div></div>" +
      '<div class="ladrilho"><div class="r">Pix e transferência</div><div class="v">' + A.dinheiro(pix) + '</div></div><div class="ladrilho"><div class="r">Dinheiro</div><div class="v">' + A.dinheiro(din) + "</div></div>" +
      '<div class="ladrilho"><div class="r">Pagamentos</div><div class="v">' + pags.length + "</div></div></div>" +
      '<div class="cartao"><div class="linha"><h3>Fechamento</h3><span class="peq mudo dir">toque na pessoa para ver e enviar</span></div><div class="tabela"><table style="margin-top:8px"><thead><tr><th>Pessoa</th><th class="n">Dias</th><th class="n">Previsto</th>' +
      '<th class="n">Pago</th><th class="n">Adiant./vales</th><th class="n">Reembolsos</th><th class="n">Saldo</th></tr></thead><tbody>' +
      linhas.map(function (l, k) {
        var f = l.f;
        return '<tr class="clic" data-fe="' + k + '"><td><b>' + esc(l.p ? l.p.nome : "Sem pessoa") + "</b></td><td class=\"n\">" + (f.dias ? f.dias.length : "—") + '</td><td class="n">' + (f.previsto === null ? "—" : A.dinheiro(f.previsto)) +
          '</td><td class="n">' + A.dinheiro(f.pago) + '</td><td class="n">' + A.dinheiro(f.adiant) + '</td><td class="n">' + A.dinheiro(f.reemb) + '</td><td class="n"><b style="color:' +
          (f.saldo === null ? "inherit" : f.saldo > 0.009 ? "var(--critico)" : "var(--bom)") + '">' + (f.saldo === null ? "—" : f.saldo > 0.009 ? "falta " + A.dinheiro(f.saldo) : f.saldo < -0.009 ? "adiantado " + A.dinheiro(-f.saldo) : "quitado") + "</b></td></tr>";
      }).join("") + "</tbody></table></div>" +
      '<p class="peq mudo" style="margin-bottom:0">Previsto = dias com chegada registrada no “Meu dia” × diária cadastrada. Adiantamentos e vales descontam do saldo; reembolsos não.</p></div>' +
      '<div class="acoes" style="margin:0 0 14px"><button id="pg-csv">⬇️ Planilha (CSV)</button><button id="pg-rel">📤 Resumo no WhatsApp</button></div>' +
      (pags.length ? Object.keys(grupos).sort().reverse().map(function (k) {
        var g = grupos[k];
        return '<div class="cartao"><div class="linha"><h3>' + esc(rotuloGrupo(k)) + '</h3><b class="dir">' + A.dinheiro(soma(g)) + '</b></div><div class="lista" style="margin-top:8px">' + g.map(function (p) {
          return '<button class="item" data-pg="' + p.id + '"><span class="meio"><span class="forte">' + esc(nomePessoa(p.pessoa_id)) + " · " + esc(TIPOS[p.tipo].split(" (")[0]) + '</span><span class="mudo peq">' +
            A.data(p.pago_em) + " " + A.hora(p.pago_em) + " · " + esc(FORMAS[p.forma]) + (p.descricao ? " · " + esc(p.descricao) : "") + (p.comprovante ? " · 📎" : "") +
            '</span></span><span class="fim"><b>' + A.dinheiro(p.valor) + "</b></span></button>";
        }).join("") + "</div></div>";
      }).join("") : '<div class="vazio">Nenhum pagamento neste período.</div>');
    $$("[data-fe]", r).forEach(function (tr) { tr.onclick = function () { var l = linhas[Number(tr.dataset.fe)]; docFechamento(l.p, l.f); }; });
    $$("[data-pg]", r).forEach(function (b) { b.onclick = function () { editar(D.pags.find(function (p) { return p.id === b.dataset.pg; })); }; });
    $("#pg-csv").onclick = function () { baixarCsv(pags); };
    $("#pg-rel").onclick = function () {
      var l = ["*Pagamentos da equipe — " + S().empresa.nome + "*", A.data(it.ini) + " a " + A.data(somar(it.fim, -1)), ""];
      linhas.forEach(function (x) { l.push((x.p ? x.p.nome : "Sem pessoa") + ": " + A.dinheiro(x.f.total) + (x.f.saldo > 0.009 ? " (falta " + A.dinheiro(x.f.saldo) + ")" : "")); });
      l.push("", "*Total: " + A.dinheiro(pix + din) + "*");
      window.open(A.linkZap("", l.join("\n")), "_blank", "noopener");
    };
  }

  function baixarCsv(pags) {
    var c = function (v) { v = String(v === null || v === undefined ? "" : v); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var l = [["Data", "Hora", "Pessoa", "Tipo", "Forma", "Valor", "Descrição", "Favorecido no comprovante", "ID da transação"].join(";")];
    pags.slice().sort(function (a, b) { return new Date(a.pago_em) - new Date(b.pago_em); }).forEach(function (p) {
      l.push([A.data(p.pago_em), A.hora(p.pago_em), nomePessoa(p.pessoa_id), TIPOS[p.tipo], FORMAS[p.forma].replace("💵 ", ""), Number(p.valor).toFixed(2).replace(".", ","), p.descricao, p.favorecido, p.id_transacao].map(c).join(";"));
    });
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + l.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    a.download = "pagamentos-" + iso(intervalo().ini) + ".csv"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }

  // ---------- conferir o que foi lido e salvar ----------
  function receber(rc) {
    if (!X().podeGravar()) { A.avisar(A.msgErro({ message: "row-level security" }), "erro"); return; }
    var itens = [], ativos = D.pessoas.filter(function (p) { return p.ativo; });
    var j = A.janela('<div id="rc-st" class="aviso" style="background:var(--sup2)">Preparando...</div><div id="rc-itens" class="lista"></div><div id="rc-res"></div>' +
      '<div class="acoes"><button class="prim" id="rc-salvar" disabled>Salvar</button></div>', { titulo: rc.especie ? "Pagamento em dinheiro" : "Conferir comprovantes", larga: true, fixa: true });
    var el = j.el;
    function st(h) { $("#rc-st", el).innerHTML = h; }
    var fila = (rc.arquivos || []).map(function (f) { return { f: f }; }).concat((rc.textos || []).map(function (t) { return { t: t }; }));
    if (rc.especie) fila = [{ vazio: true }];
    fila.reduce(function (pr, x, i) {
      return pr.then(function () {
        if (x.vazio) { itens.push({ forma: "dinheiro", data: iso(new Date()), hora: A.hora(new Date()), tipo: "diaria" }); return; }
        if (x.t) { itens.push(Object.assign(L().lerPix(x.t), { texto: x.t })); return; }
        L().progresso(function (n) { st("📖 Lendo " + (i + 1) + " de " + fila.length + "... " + n + "%"); });
        st("📖 Lendo " + (i + 1) + " de " + fila.length + "... (na primeira vez o leitor é baixado)");
        return L().textoDoArquivo(x.f).then(function (r) { itens.push(Object.assign(L().lerPix(r.texto), { imagem: r.imagem || null, nomeArq: x.f.name })); },
          function (e) { itens.push({ erro: A.msgErro(e), nomeArq: x.f.name, imagem: /^image\//.test(x.f.type) ? x.f : null }); });
      });
    }, Promise.resolve()).then(function () {
      itens.forEach(function (it) {
        it.ok = true; it.tipo = it.tipo || "diaria"; it.forma = it.forma || "pix";
        var a = (it.favorecido || it.chave || it.cpf) && L().acharPessoa(ativos, it.favorecido || "", it.chave, it.cpf);
        if (a) { it.pessoa_id = a.f.id; it.por = a.por; } else if (it.favorecido) it.pessoa_id = "nova";
      });
      return marcarRepetidos(itens);
    }).then(function () {
      st(rc.especie ? "Preencha e salve." : itens.length + (itens.length > 1 ? " comprovantes lidos" : " comprovante lido") + ". Confira e ajuste o que precisar.");
      desenharItens(); $("#rc-salvar", el).disabled = false;
    }).catch(function (e) { st('<span style="color:var(--critico)">' + esc(A.msgErro(e)) + "</span>"); });

    function desenharItens() {
      $("#rc-itens", el).innerHTML = itens.map(function (it, i) {
        var prev = it.imagem ? URL.createObjectURL(it.imagem) : "";
        return '<div class="cartao" data-it="' + i + '" style="margin:0' + (it.ok ? "" : ";opacity:.6") + '"><div class="linha" style="align-items:flex-start;flex-wrap:nowrap">' +
          (prev ? '<a href="' + prev + '" target="_blank" rel="noopener"><img class="foto-mini" alt="Comprovante" src="' + prev + '"></a>' : "") +
          '<div style="flex:1;min-width:0">' + (it.erro ? '<div class="aviso erro">Não consegui ler ' + esc(it.nomeArq || "") + ": " + esc(it.erro) + ". Preencha à mão.</div>" : "") +
          (it.repetido ? '<div class="aviso">⚠️ Parece já lançado: ' + esc(it.repetido) + ". Desmarcado para não duplicar.</div>" : "") +
          (it.favorecido ? '<div class="peq mudo">No comprovante: <b>' + esc(it.favorecido) + "</b>" + (it.por ? " · achado pela " + esc(it.por) : "") + "</div>" : "") +
          '<label class="check" style="margin-top:4px"><input type="checkbox" data-k="ok"' + (it.ok ? " checked" : "") + "> Salvar este</label></div></div>" +
          '<div class="duas"><div><label>Pessoa</label><select data-k="pessoa_id"><option value="">— escolha —</option>' +
          (it.favorecido ? '<option value="nova"' + (it.pessoa_id === "nova" ? " selected" : "") + ">➕ Cadastrar “" + esc(A.maiuscula(it.favorecido.toLowerCase())) + "”</option>" : "") +
          ativos.map(function (p) { return '<option value="' + p.id + '"' + (p.id === it.pessoa_id ? " selected" : "") + ">" + esc(p.nome) + "</option>"; }).join("") + "</select></div>" +
          '<div><label>Valor (R$)</label><input data-k="valor" inputmode="decimal" value="' + (it.valor ? esc(Number(it.valor).toFixed(2).replace(".", ",")) : "") + '"></div></div>' +
          '<div class="tres"><div><label>Data</label><input data-k="data" type="date" value="' + esc(it.data || "") + '"></div><div><label>Hora</label><input data-k="hora" type="time" value="' + esc(it.hora || "") + '"></div>' +
          '<div><label>Tipo</label><select data-k="tipo">' + Object.keys(TIPOS).map(function (k) { return '<option value="' + k + '"' + (it.tipo === k ? " selected" : "") + ">" + TIPOS[k] + "</option>"; }).join("") + "</select></div></div>" +
          '<div class="duas"><div><label>Forma</label><select data-k="forma">' + Object.keys(FORMAS).map(function (k) { return '<option value="' + k + '"' + (it.forma === k ? " selected" : "") + ">" + FORMAS[k] + "</option>"; }).join("") + "</select></div>" +
          '<div><label>Descrição</label><input data-k="descricao" maxlength="200" value="' + esc(it.descricao || "") + '" placeholder="Ex.: diárias de seg a qua"></div></div></div>';
      }).join("");
      $$("[data-it]", el).forEach(function (card) {
        var it = itens[Number(card.dataset.it)];
        $$("[data-k]", card).forEach(function (inp) {
          inp.onchange = inp.oninput = function () {
            var k = inp.dataset.k;
            it[k] = k === "ok" ? inp.checked : k === "valor" ? A.lerNumero(inp.value) : inp.value;
            if (k === "ok") card.style.opacity = it.ok ? "" : ".6";
            resumo();
          };
        });
      });
      resumo();
    }
    function resumo() {
      var sel = itens.filter(function (it) { return it.ok; });
      $("#rc-res", el).innerHTML = sel.length ? '<p class="peq"><b>' + sel.length + "</b> para salvar · total <b>" + A.dinheiro(soma(sel)) + "</b></p>" : "";
    }
    $("#rc-salvar", el).onclick = function () {
      var b = this, sel = itens.filter(function (it) { return it.ok; });
      if (!sel.length) { A.avisar("Nada marcado para salvar.", "erro"); return; }
      var falta = sel.filter(function (it) { return !it.pessoa_id || !(it.valor > 0) || !it.data; });
      if (falta.length) { A.avisar("Preencha pessoa, valor e data de todos os marcados.", "erro"); return; }
      A.ocupado(b, true, "Salvando...");
      var novas = {}, salvos = 0, repetidos = 0, semComp = [];
      sel.reduce(function (pr, it) {
        return pr.then(function () {
          // pessoa nova vinda do comprovante (uma só por nome)
          if (it.pessoa_id !== "nova") return it.pessoa_id;
          var nome = A.maiuscula(it.favorecido.toLowerCase()).replace(/\b(\w)/g, function (m) { return m.toUpperCase(); }).replace(/\b(Da|De|Do|Das|Dos|E)\b/g, function (m) { return m.toLowerCase(); });
          if (novas[nome]) return novas[nome];
          return sb().from("pessoas").insert({ nome: nome, pix: it.chave || null }).select().single().then(function (r) {
            if (r.error) throw r.error; D.pessoas.push(r.data); novas[nome] = r.data.id; return r.data.id;
          });
        }).then(function (pid) {
          var pComp = !it.imagem ? Promise.resolve(null) : A.reduzirFoto(it.imagem, 1600).then(function (bl) {
            var cam = S().empresa.id + "/pagamentos/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ".jpg";
            return sb().storage.from("fotos").upload(cam, bl, { contentType: "image/jpeg" }).then(function (r) { if (r.error) throw r.error; return cam; });
          }).catch(function (e) { semComp.push(A.msgErro(e)); return null; });   // sem o comprovante, o pagamento ainda é salvo (e avisa)
          return pComp.then(function (cam) {
            return sb().from("pagamentos").insert({ pessoa_id: pid, valor: it.valor, pago_em: new Date(it.data + "T" + (it.hora || "12:00") + ":00").toISOString(),
              tipo: it.tipo, forma: it.forma, favorecido: it.favorecido || null, id_transacao: it.id || null, descricao: (it.descricao || "").trim() || null, comprovante: cam });
          }).then(function (r) {
            if (r.error) { if (/pagamentos_trans_idx|duplicate/i.test(r.error.message)) { repetidos++; return; } throw r.error; }
            salvos++;
          });
        });
      }, Promise.resolve()).then(function () {
        A.avisar(salvos + (salvos === 1 ? " pagamento salvo" : " pagamentos salvos") + (repetidos ? " · " + repetidos + " já estava(m) lançado(s)" : "") + ".", "ok");
        if (semComp.length) A.avisar("Atenção: " + semComp.length + " comprovante(s) não foram guardados (" + semComp[0] + "). Os pagamentos foram salvos.", "erro");
        j.fechar(); atualizar();
      }).catch(function (e) { A.avisar(A.msgErro(e), "erro"); A.ocupado(b, false); });
    };
  }
  // já lançado? mesmo ID da transação, ou mesma pessoa + valor + dia
  function marcarRepetidos(itens) {
    var datas = itens.map(function (it) { return it.data; }).filter(Boolean).sort();
    if (!datas.length) return Promise.resolve();
    var ini = new Date(datas[0] + "T00:00:00"), fim = somar(new Date(datas[datas.length - 1] + "T00:00:00"), 1);
    return sb().from("pagamentos").select("pessoa_id,valor,pago_em,id_transacao").gte("pago_em", ini.toISOString()).lt("pago_em", fim.toISOString()).limit(5000).then(function (r) {
      var l = r.data || [];
      itens.forEach(function (it) {
        var x = l.find(function (p) { return (it.id && p.id_transacao === it.id.replace(/\s/g, "")) || (it.pessoa_id && p.pessoa_id === it.pessoa_id && Number(p.valor) === Number(it.valor) && diaLocal(p.pago_em) === it.data); });
        if (x) { it.ok = false; it.repetido = nomePessoa(x.pessoa_id) + ", " + A.dinheiro(x.valor) + " em " + A.data(x.pago_em); }
      });
      // o mesmo comprovante duas vezes na mesma leitura
      itens.forEach(function (it, i) { if (it.ok && it.id && itens.slice(0, i).some(function (o) { return o.id === it.id; })) { it.ok = false; it.repetido = "o mesmo comprovante foi escolhido duas vezes"; } });
    });
  }

  // ---------- editar um pagamento ----------
  function editar(p) {
    var j = A.janela('<div id="pe-comp"></div><label for="pe-pes">Pessoa</label><select id="pe-pes"><option value="">— sem pessoa —</option>' +
      D.pessoas.map(function (x) { return '<option value="' + x.id + '">' + esc(x.nome) + "</option>"; }).join("") + "</select>" +
      '<div class="duas"><div><label for="pe-val">Valor (R$)</label><input id="pe-val" inputmode="decimal" value="' + esc(Number(p.valor).toFixed(2).replace(".", ",")) + '"></div>' +
      '<div><label for="pe-tipo">Tipo</label><select id="pe-tipo">' + Object.keys(TIPOS).map(function (k) { return '<option value="' + k + '">' + TIPOS[k] + "</option>"; }).join("") + "</select></div></div>" +
      '<div class="tres"><div><label for="pe-data">Data</label><input id="pe-data" type="date" value="' + diaLocal(p.pago_em) + '"></div><div><label for="pe-hora">Hora</label><input id="pe-hora" type="time" value="' + A.hora(p.pago_em) + '"></div>' +
      '<div><label for="pe-forma">Forma</label><select id="pe-forma">' + Object.keys(FORMAS).map(function (k) { return '<option value="' + k + '">' + FORMAS[k] + "</option>"; }).join("") + "</select></div></div>" +
      '<label for="pe-desc">Descrição</label><input id="pe-desc" maxlength="200" value="' + esc(p.descricao || "") + '">' +
      (p.favorecido ? '<p class="peq mudo">No comprovante: ' + esc(p.favorecido) + (p.id_transacao ? " · ID " + esc(p.id_transacao) : "") + "</p>" : "") +
      '<div class="acoes"><button class="prim" id="pe-salvar">Salvar</button><button class="perigo" id="pe-apagar">Apagar</button></div>', { titulo: "Pagamento" });
    var el = j.el;
    $("#pe-pes", el).value = p.pessoa_id || ""; $("#pe-tipo", el).value = p.tipo; $("#pe-forma", el).value = p.forma;
    if (p.comprovante) sb().storage.from("fotos").createSignedUrls([p.comprovante], 3600).then(function (r) {
      var u = r.data && r.data[0] && r.data[0].signedUrl, c = $("#pe-comp", el);
      if (u && c) c.innerHTML = '<a href="' + esc(u) + '" target="_blank" rel="noopener"><img alt="Comprovante" src="' + esc(u) + '" style="max-height:220px;max-width:100%;border-radius:10px;border:1px solid var(--borda)"></a>';
    });
    $("#pe-salvar", el).onclick = function () {
      var b = this, v = A.lerNumero($("#pe-val", el).value);
      if (!(v > 0)) { A.avisar("Valor inválido.", "erro"); return; }
      A.ocupado(b, true);
      sb().from("pagamentos").update({ pessoa_id: $("#pe-pes", el).value || null, valor: v, tipo: $("#pe-tipo", el).value, forma: $("#pe-forma", el).value,
        pago_em: new Date($("#pe-data", el).value + "T" + ($("#pe-hora", el).value || "12:00") + ":00").toISOString(), descricao: $("#pe-desc", el).value.trim() || null })
        .eq("id", p.id).then(function (r) { if (r.error) throw r.error; A.avisar("Salvo.", "ok"); j.fechar(); atualizar(); })
        .catch(function (e) { A.avisar(A.msgErro(e), "erro"); A.ocupado(b, false); });
    };
    $("#pe-apagar", el).onclick = function () {
      A.confirmar("Apagar este pagamento de " + A.dinheiro(p.valor) + "?", "Apagar").then(function (ok) {
        if (!ok) return;
        (p.comprovante ? sb().storage.from("fotos").remove([p.comprovante]) : Promise.resolve()).then(function () { return sb().from("pagamentos").delete().eq("id", p.id); })
          .then(function (r) { if (r && r.error) throw r.error; A.avisar("Apagado.", "ok"); j.fechar(); atualizar(); })
          .catch(function (e) { A.avisar(A.msgErro(e), "erro"); });
      });
    };
  }

  // ---------- pessoas (quem recebe) ----------
  function pessoas() {
    var j = A.janela('<p class="peq mudo">Quem recebe pagamento: funcionários com acesso ao app e diaristas. A <b>chave Pix</b> faz o app reconhecer o comprovante; a <b>diária</b> calcula o fechamento.</p>' +
      '<div class="lista" id="ps-lst"></div><div id="ps-sug"></div><div class="acoes"><button class="prim" id="ps-nova">+ Pessoa</button></div>', { titulo: "Pessoas", larga: true });
    var el = j.el;
    function desenhar() {
      $("#ps-lst", el).innerHTML = D.pessoas.length ? D.pessoas.map(function (p) {
        return '<button class="item" data-ps="' + p.id + '"><span class="meio"><span class="forte">' + esc(p.nome) + (p.ativo ? "" : ' <span class="selo critico">Saiu</span>') + '</span><span class="mudo peq">' +
          esc([p.funcao, p.diaria ? "diária " + A.dinheiro(p.diaria) : "", p.pix ? "Pix ✓" : "sem chave Pix", p.usuario ? "📱 usa o app" : ""].filter(Boolean).join(" · ")) + "</span></span></button>";
      }).join("") : '<div class="mudo peq">Ninguém ainda.</div>';
      $$("[data-ps]", el).forEach(function (b) { b.onclick = function () { pessoa(D.pessoas.find(function (p) { return p.id === b.dataset.ps; }), desenhar); }; });
      // gente da equipe do app que ainda não está aqui
      var falta = S().membros.filter(function (m) { return m.ativo && !D.pessoas.some(function (p) { return p.usuario === m.usuario; }); });
      $("#ps-sug", el).innerHTML = falta.length ? '<div class="aviso" style="background:var(--sup2)">Da equipe do app ainda sem cadastro aqui: ' + falta.map(function (m) {
        return '<button class="peq" data-add="' + m.usuario + '">+ ' + esc(m.nome || m.email) + "</button>";
      }).join(" ") + "</div>" : "";
      $$("[data-add]", el).forEach(function (b) {
        b.onclick = function () {
          var m = S().membros.find(function (x) { return x.usuario === b.dataset.add; });
          pessoa({ nome: m.nome || m.email.split("@")[0], usuario: m.usuario, ativo: true }, desenhar);
        };
      });
    }
    $("#ps-nova", el).onclick = function () { pessoa(null, desenhar); };
    desenhar();
    // a equipe pode ter mudado desde que o app abriu (alguém entrou pelo convite)
    sb().from("membros").select("*").order("criado_em").then(function (r) { if (!r.error && r.data) { S().membros = r.data; if ($("#ps-lst", el)) desenhar(); } });
  }
  function pessoa(p, depois) {
    var novo = !p || !p.id; p = p || { ativo: true };
    var j = A.janela('<label for="pp-nome">Nome *</label><input id="pp-nome" maxlength="120" value="' + esc(p.nome || "") + '">' +
      '<div class="duas"><div><label for="pp-fun">Função</label><input id="pp-fun" maxlength="60" value="' + esc(p.funcao || "") + '" placeholder="Ex.: eletricista, ajudante"></div>' +
      '<div><label for="pp-tel">Telefone / WhatsApp</label><input id="pp-tel" inputmode="tel" maxlength="30" value="' + esc(p.telefone || "") + '"></div>' +
      '<div><label for="pp-pix">Chave Pix</label><input id="pp-pix" maxlength="120" value="' + esc(p.pix || "") + '" placeholder="CPF, celular, e-mail ou chave aleatória"></div>' +
      '<div><label for="pp-dia">Diária (R$)</label><input id="pp-dia" inputmode="decimal" value="' + (p.diaria ? esc(Number(p.diaria).toFixed(2).replace(".", ",")) : "") + '"></div></div>' +
      '<label for="pp-usu">Login no app</label><select id="pp-usu"><option value="">— não usa o app —</option>' +
      S().membros.map(function (m) { return '<option value="' + m.usuario + '">' + esc((m.nome || m.email) + " (" + m.email + ")") + "</option>"; }).join("") + "</select>" +
      '<p class="peq mudo">Com o login, os dias do “Meu dia” contam no fechamento e a pessoa vê os próprios pagamentos em 👤 Minha conta.</p>' +
      '<label class="check"><input type="checkbox" id="pp-ativo"' + (p.ativo !== false ? " checked" : "") + "> Ainda trabalha com a gente</label>" +
      '<div class="acoes"><button class="prim" id="pp-salvar">Salvar</button>' + (novo ? "" : '<button class="perigo" id="pp-apagar">Apagar</button>') + "</div>", { titulo: novo ? "Nova pessoa" : p.nome });
    var el = j.el;
    $("#pp-usu", el).value = p.usuario || "";
    $("#pp-salvar", el).onclick = function () {
      var b = this, nome = $("#pp-nome", el).value.trim();
      if (!nome) { A.avisar("Informe o nome.", "erro"); return; }
      var d = { nome: A.maiuscula(nome), funcao: $("#pp-fun", el).value.trim() || null, telefone: $("#pp-tel", el).value.trim() || null, pix: $("#pp-pix", el).value.trim() || null,
        diaria: $("#pp-dia", el).value.trim() ? Math.max(0, A.lerNumero($("#pp-dia", el).value)) : null, usuario: $("#pp-usu", el).value || null, ativo: $("#pp-ativo", el).checked };
      A.ocupado(b, true);
      (novo ? sb().from("pessoas").insert(d) : sb().from("pessoas").update(d).eq("id", p.id)).select().single().then(function (r) {
        if (r.error) throw r.error;
        if (novo) D.pessoas.push(r.data); else D.pessoas[D.pessoas.findIndex(function (x) { return x.id === p.id; })] = r.data;
        D.pessoas.sort(function (a, c) { return a.nome.localeCompare(c.nome, "pt-BR"); });
        A.avisar("Salvo.", "ok"); j.fechar(); if (depois) depois(); desenhar();
      }).catch(function (e) { A.avisar(/pessoas_usuario_idx/.test(e.message || "") ? "Esse login já está ligado a outra pessoa." : A.msgErro(e), "erro"); A.ocupado(b, false); });
    };
    var ap = $("#pp-apagar", el);
    if (ap) ap.onclick = function () {
      A.confirmar("Apagar " + p.nome + "? Os pagamentos dela continuam guardados, sem nome. Se a pessoa só saiu, desmarque “Ainda trabalha com a gente”.", "Apagar").then(function (ok) {
        if (!ok) return;
        sb().from("pessoas").delete().eq("id", p.id).then(function (r) {
          if (r.error) throw r.error; D.pessoas = D.pessoas.filter(function (x) { return x.id !== p.id; }); A.avisar("Apagada.", "ok"); j.fechar(); if (depois) depois(); desenhar();
        }).catch(function (e) { A.avisar(A.msgErro(e), "erro"); });
      });
    };
  }

  // ---------- fechamento de uma pessoa (PDF / WhatsApp) ----------
  function docFechamento(p, f) {
    var e = S().empresa, it = intervalo(), per = A.data(it.ini) + " a " + A.data(somar(it.fim, -1));
    var cams = f.pags.map(function (x) { return x.comprovante; }).filter(Boolean);
    (cams.length ? sb().storage.from("fotos").createSignedUrls(cams, 3600).then(function (r) { (r.data || []).forEach(function (x) { if (x.signedUrl) urls[x.path] = x.signedUrl; }); }).catch(function () {}) : Promise.resolve())
      .then(function () {
        var fd = document.createElement("div"); fd.className = "doc-fundo";
        fd.innerHTML = '<div class="doc-barra"><button class="prim" id="d-imp">🖨️ Imprimir / Salvar PDF</button><button class="zap" id="d-zap">WhatsApp</button><button id="d-fechar">Fechar</button></div>' +
          '<div class="doc" style="--doc-cor:' + esc(e.cor1) + '"><div class="doc-cab">' + (e.logo ? '<img alt="" src="' + esc(e.logo) + '">' : "") +
          '<div class="emp"><h1>' + esc(e.nome) + "</h1><div>" + esc(e.cnpj ? "CNPJ " + e.cnpj : "") + '</div></div><div class="num">FECHAMENTO<b>' + esc(p ? p.nome : "Sem pessoa") + "</b>" + per + "</div></div>" +
          (f.dias ? "<h3>Dias trabalhados (" + f.dias.length + ")</h3><div>" + (f.dias.length ? f.dias.map(function (d) { return dataBR(d).slice(0, 5); }).join(" · ") : "Nenhum dia registrado no período.") + "</div>" : "") +
          "<h3>Pagamentos</h3>" + (f.pags.length ? '<table><thead><tr><th>Data</th><th>Tipo</th><th>Forma</th><th class="n">Valor</th></tr></thead><tbody>' +
            f.pags.slice().sort(function (a, b) { return new Date(a.pago_em) - new Date(b.pago_em); }).map(function (x) {
              return "<tr><td>" + A.data(x.pago_em) + "</td><td>" + esc(TIPOS[x.tipo].split(" (")[0]) + (x.descricao ? " — " + esc(x.descricao) : "") + "</td><td>" + esc(FORMAS[x.forma].replace("💵 ", "")) +
                (x.comprovante && urls[x.comprovante] ? ' <a href="' + esc(urls[x.comprovante]) + '" target="_blank" rel="noopener">📎</a>' : "") + '</td><td class="n">' + A.dinheiro(x.valor) + "</td></tr>";
            }).join("") + "</tbody></table>" : "<div>Nenhum pagamento no período.</div>") +
          '<div class="tot">' + (f.previsto !== null ? "<div><span>Previsto (" + f.dias.length + " × " + A.dinheiro(p.diaria) + ")</span><span>" + A.dinheiro(f.previsto) + "</span></div>" : "") +
          "<div><span>Pago</span><span>" + A.dinheiro(f.pago) + "</span></div><div><span>Adiantamentos e vales</span><span>" + A.dinheiro(f.adiant) + "</span></div>" +
          (f.reemb ? "<div><span>Reembolsos</span><span>" + A.dinheiro(f.reemb) + "</span></div>" : "") +
          (f.saldo !== null ? '<div class="g"><span>' + (f.saldo > 0.009 ? "Falta pagar" : f.saldo < -0.009 ? "Pago a mais" : "Quitado") + "</span><span>" + A.dinheiro(Math.abs(f.saldo)) + "</span></div>" :
            '<div class="g"><span>Total recebido</span><span>' + A.dinheiro(f.total) + "</span></div>") + "</div>" +
          '<div class="assin"><div>' + esc(e.nome) + "</div><div>" + esc(p ? p.nome : "") + '</div></div><div class="rod">Feito com AGEstor</div></div>';
        document.body.appendChild(fd);
        $("#d-fechar", fd).onclick = function () { fd.remove(); document.body.classList.remove("imprimindo"); };
        $("#d-imp", fd).onclick = function () {
          document.body.classList.add("imprimindo"); var antes = document.title; document.title = "Fechamento " + (p ? p.nome : "") + " " + per;
          setTimeout(function () { window.print(); document.title = antes; document.body.classList.remove("imprimindo"); }, 50);
        };
        $("#d-zap", fd).onclick = function () {
          var l = ["*Fechamento — " + e.nome + "*", (p ? p.nome : "") + " · " + per];
          if (f.dias) l.push("Dias trabalhados: " + f.dias.length);
          if (f.previsto !== null) l.push("Previsto: " + A.dinheiro(f.previsto));
          l.push("Pago: " + A.dinheiro(f.pago), "Adiantamentos/vales: " + A.dinheiro(f.adiant));
          if (f.reemb) l.push("Reembolsos: " + A.dinheiro(f.reemb));
          if (f.saldo !== null) l.push("*" + (f.saldo > 0.009 ? "Falta pagar: " + A.dinheiro(f.saldo) : f.saldo < -0.009 ? "Pago a mais: " + A.dinheiro(-f.saldo) : "Quitado ✅") + "*");
          window.open(A.linkZap(p && p.telefone ? p.telefone : "", l.join("\n")), "_blank", "noopener");
        };
      });
  }

  // ---------- "Meus pagamentos" (para quem é da equipe, em Minha conta) ----------
  function meus(alvo) {
    var ini = somar(new Date(), -60);
    // só os pagamentos ligados ao meu login (o dono, que vê todos, também só vê os dele aqui)
    sb().from("pessoas").select("id").eq("usuario", S().user.id).maybeSingle().then(function (x) {
      if (x.error || !x.data) return { data: [] };
      return sb().from("pagamentos").select("*").eq("pessoa_id", x.data.id).gte("pago_em", ini.toISOString()).order("pago_em", { ascending: false }).limit(200);
    }).then(function (r) {
      if (r.error) throw r.error;
      var l = r.data || [];
      if (!l.length) { alvo.innerHTML = ""; return; }
      var cams = l.map(function (p) { return p.comprovante; }).filter(Boolean);
      return (cams.length ? sb().storage.from("fotos").createSignedUrls(cams, 3600).then(function (x) { (x.data || []).forEach(function (y) { if (y.signedUrl) urls[y.path] = y.signedUrl; }); }) : Promise.resolve()).then(function () {
        alvo.innerHTML = '<h3 style="margin:14px 0 6px">💰 Meus pagamentos (60 dias)</h3><div class="lista">' + l.map(function (p) {
          return '<div class="item" style="cursor:default"><span class="meio"><span class="forte">' + A.dinheiro(p.valor) + " · " + esc(TIPOS[p.tipo].split(" (")[0]) + '</span><span class="mudo peq">' +
            A.data(p.pago_em) + " · " + esc(FORMAS[p.forma].replace("💵 ", "")) + (p.descricao ? " · " + esc(p.descricao) : "") + "</span></span>" +
            (p.comprovante && urls[p.comprovante] ? '<a class="botao peq" target="_blank" rel="noopener" href="' + esc(urls[p.comprovante]) + '">📎 Comprovante</a>' : "") + "</div>";
        }).join("") + '</div><p class="peq"><b>Total: ' + A.dinheiro(soma(l)) + "</b></p>";
      });
    }).catch(function () { alvo.innerHTML = ""; });
  }

  window.AG_PAG = { tela: tela, meus: meus };
})();
