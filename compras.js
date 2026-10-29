// AGEstor — 🧾 compras de material e despesas: lê a nota (foto, PDF ou XML), confere a soma, não deixa lançar a mesma nota
// duas vezes, controla o que falta pagar (boleto/fiado), liga a compra à ordem de serviço e guarda o custo no catálogo.
(function () {
  "use strict";
  var A = window.AG, esc = A.esc, $ = A.$, $$ = A.$$;
  var X = function () { return window.AGX; };
  var L = function () { return window.AG_LEITOR; };
  var CATS = { combustivel: "⛽ Combustível", veiculo: "🔧 Manutenção de veículo", alimentacao: "🍔 Alimentação", pedagio: "🅿️ Pedágio / estacionamento",
    ferramentas: "🛠️ Ferramentas / EPI", outros: "📦 Outros" };
  var FORMAS = { pix: "Pix", dinheiro: "Dinheiro", cartao: "Cartão", boleto: "Boleto / a prazo", fiado: "📒 Fiado (paga no mês seguinte)", outro: "Outro" };
  var PERIODOS = { mes: "Este mês", "mes-1": "Mês passado", "30d": "Últimos 30 dias", ano: "Este ano", per: "Escolher datas" };
  var F = { periodo: "mes", tipo: "", busca: "", de: "", ate: "" };
  var D = { compras: [], abertas: [] };
  var urls = {};

  function S() { return X().S(); }
  function sb() { return X().sb(); }
  function dois(n) { return String(n).padStart(2, "0"); }
  function iso(d) { return d.getFullYear() + "-" + dois(d.getMonth() + 1) + "-" + dois(d.getDate()); }
  function dataBR(s) { if (!s) return ""; var p = String(s).slice(0, 10).split("-"); return p[2] + "/" + p[1] + "/" + p[0]; }
  function num2(v) { return v || v === 0 ? Number(v).toFixed(2).replace(".", ",") : ""; }
  function soma(l, k) { return l.reduce(function (t, x) { return t + (Number(x[k || "valor"]) || 0); }, 0); }
  function hoje() { return iso(new Date()); }
  function vencFiado(data) { var d = data ? new Date(data + "T12:00:00") : new Date(); return iso(new Date(d.getFullYear(), d.getMonth() + 1, 5)); }
  function semAcento(t) { return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
  function chaveItem(n) { return semAcento(n).replace(/[^a-z0-9,]+/g, " ").replace(/\s+/g, " ").trim(); }
  function nomeOS(id) { var s = S().servicos.find(function (x) { return x.id === id; }); return s ? "OS nº " + s.numero + " · " + s.titulo : ""; }
  function destinoDe(c) { return c.servico_id ? nomeOS(c.servico_id) || "OS apagada" : c.destino || (c.tipo === "despesa" ? "—" : "Estoque / sem destino"); }
  function intervalo() {
    var h = new Date(); h.setHours(0, 0, 0, 0);
    if (F.periodo === "mes") return { ini: iso(new Date(h.getFullYear(), h.getMonth(), 1)), fim: iso(new Date(h.getFullYear(), h.getMonth() + 1, 0)) };
    if (F.periodo === "mes-1") return { ini: iso(new Date(h.getFullYear(), h.getMonth() - 1, 1)), fim: iso(new Date(h.getFullYear(), h.getMonth(), 0)) };
    if (F.periodo === "30d") { var d = new Date(h); d.setDate(d.getDate() - 29); return { ini: iso(d), fim: iso(h) }; }
    if (F.periodo === "ano") return { ini: h.getFullYear() + "-01-01", fim: h.getFullYear() + "-12-31" };
    return { ini: F.de || iso(new Date(h.getFullYear(), h.getMonth(), 1)), fim: F.ate || iso(h) };
  }
  function contexto() {
    var e = S().empresa;
    L().contexto({ cnpj: e.cnpj, nome: e.nome, email: e.email, cnpjs: D.compras.map(function (c) { return c.cnpj; }).filter(Boolean) });
  }

  // ---------- dados ----------
  function carregar() {
    var r = intervalo();
    return Promise.all([
      sb().from("compras").select("*").gte("comprado_em", r.ini).lte("comprado_em", r.fim).order("comprado_em", { ascending: false }).limit(3000),
      sb().from("compras").select("*").eq("pago", false).order("vencimento", { ascending: true }).limit(500)
    ]).then(function (x) {
      x.forEach(function (y) { if (y.error) throw y.error; });
      D.compras = x[0].data; D.abertas = x[1].data;
    });
  }

  // ---------- tela ----------
  function tela(t) {
    t.innerHTML = X().avisoSituacao() + '<h2 style="margin-bottom:10px">Compras e despesas</h2>' +
      '<div class="cartao"><div class="acoes" style="margin-top:0"><button class="prim" id="cp-ler">📎 Ler nota</button><button id="cp-mao">✍️ Lançar à mão</button>' +
      '<button id="cp-desp">⛽ Despesa</button><button id="cp-colar">📋 Colar lista</button></div>' +
      '<input id="cp-arq" type="file" multiple accept="image/*,application/pdf,.pdf,.xml,text/xml,application/xml,.txt" class="oculto">' +
      '<p class="peq mudo" style="margin-bottom:0">Foto do cupom ou da DANFE, PDF ou o <b>XML</b> que a loja manda por e-mail (o XML é o mais exato). Pode escolher várias.</p></div>' +
      '<div id="cp-alerta"></div>' +
      '<div class="tres"><div><label for="cp-per">Período</label><select id="cp-per">' + Object.keys(PERIODOS).map(function (k) { return '<option value="' + k + '">' + PERIODOS[k] + "</option>"; }).join("") + "</select></div>" +
      '<div><label for="cp-tipo">Mostrar</label><select id="cp-tipo"><option value="">Tudo</option><option value="material">Material</option><option value="despesa">Despesas</option></select></div>' +
      '<div><label for="cp-busca">Buscar</label><input id="cp-busca" type="search" placeholder="Loja, material, OS..." value="' + esc(F.busca) + '"></div></div>' +
      '<div class="duas' + (F.periodo === "per" ? "" : " oculto") + '" id="cp-datas"><div><label for="cp-de">De</label><input id="cp-de" type="date" value="' + esc(F.de) + '"></div><div><label for="cp-ate">Até</label><input id="cp-ate" type="date" value="' + esc(F.ate) + '"></div></div>' +
      '<div id="cp-res" style="margin-top:14px"><div class="vazio">Carregando...</div></div>';
    $("#cp-per").value = F.periodo; $("#cp-tipo").value = F.tipo;
    $("#cp-per").onchange = function () { F.periodo = this.value; $("#cp-datas").classList.toggle("oculto", F.periodo !== "per"); atualizar(); };
    $("#cp-tipo").onchange = function () { F.tipo = this.value; desenhar(); };
    $("#cp-busca").oninput = function () { F.busca = this.value; desenhar(); };
    $("#cp-de").onchange = function () { F.de = this.value; atualizar(); };
    $("#cp-ate").onchange = function () { F.ate = this.value; atualizar(); };
    $("#cp-ler").onclick = function () { $("#cp-arq").value = ""; $("#cp-arq").click(); };
    $("#cp-arq").onchange = function () { var fs = Array.prototype.slice.call(this.files || []); if (fs.length) receber(fs); };
    $("#cp-mao").onclick = function () { formulario({ dados: { data: hoje(), itens: [] }, tipo: "material" }); };
    $("#cp-desp").onclick = function () { formulario({ dados: { data: hoje(), itens: [] }, tipo: "despesa" }); };
    $("#cp-colar").onclick = function () {
      var j = A.janela('<p class="peq mudo">Cole o texto da nota ou uma lista (ex.: “2 un Disjuntor 20A 18,90”). Uma linha por material.</p><textarea id="cp-txt" rows="10"></textarea>' +
        '<div class="acoes"><button class="prim" id="cp-ok">Ler</button></div>', { titulo: "Colar nota ou lista" });
      $("#cp-ok", j.el).onclick = function () {
        var tx = $("#cp-txt", j.el).value; j.fechar(); if (!tx.trim()) return;
        contexto();
        var d = L().lerNota(tx);
        if (!d.itens || !d.itens.length) {   // lista simples ("2 un Disjuntor 20A 18,90"): o total é o escrito ou a soma
          var ls = L().lerLista(tx); d.itens = ls.itens; d.data = d.data || ls.data;
          d.valor = ls.valor || Math.round(L().somaItens(ls) * 100) / 100 || (d.valorIncerto ? null : d.valor) || null; delete d.valorIncerto;
        }
        formulario({ dados: Object.assign({ data: hoje() }, d), tipo: "material" });
      };
    };
    atualizar();
  }
  function atualizar() {
    var r = $("#cp-res"); if (!r) return;
    carregar().then(desenhar).catch(function (e) { r.innerHTML = '<div class="aviso erro">' + esc(A.msgErro(e)) + "</div>"; });
  }
  function situacao(c) {
    if (c.pago) return null;
    if (!c.vencimento) return { txt: "a pagar", cls: "atencao" };
    var d = Math.round((new Date(c.vencimento + "T12:00:00") - new Date(hoje() + "T12:00:00")) / A.DIA);
    return d < 0 ? { txt: "vencida há " + -d + " dia(s)", cls: "critico", d: d } : d === 0 ? { txt: "vence hoje", cls: "critico", d: 0 } : { txt: "vence " + dataBR(c.vencimento).slice(0, 5), cls: "atencao", d: d };
  }
  function desenhar() {
    var r = $("#cp-res"); if (!r) return;
    // alerta do que falta pagar (de qualquer período)
    var al = $("#cp-alerta"), ab = D.abertas;
    al.innerHTML = ab.length ? '<div class="cartao" style="border-left:4px solid var(--atencao)"><div class="linha"><h3>📒 Falta pagar: ' + A.dinheiro(soma(ab)) + '</h3><span class="peq mudo dir">' + ab.length + " nota(s)</span></div>" +
      '<div class="lista" style="margin-top:8px">' + ab.map(function (c) {
        var s = situacao(c);
        return '<div class="item" style="cursor:default"><span class="meio"><span class="forte">' + esc(c.fornecedor || "Loja não informada") + '</span><span class="mudo peq">' + dataBR(c.comprado_em) + " · " + esc(FORMAS[c.forma_pagamento] || "") +
          '</span></span><span class="fim"><b>' + A.dinheiro(c.valor) + '</b><span class="selo ' + s.cls + '">' + esc(s.txt) + '</span></span><button class="peq bom" data-quitar="' + c.id + '">Paguei</button></div>';
      }).join("") + "</div></div>" : "";
    $$("[data-quitar]", al).forEach(function (b) {
      b.onclick = function () {
        A.ocupado(b, true, "...");
        sb().from("compras").update({ pago: true, pago_em: new Date().toISOString() }).eq("id", b.dataset.quitar).then(function (x) {
          if (x.error) throw x.error; A.avisar("Marcada como paga.", "ok"); atualizar();
        }).catch(function (e) { A.avisar(A.msgErro(e), "erro"); A.ocupado(b, false); });
      };
    });
    var q = semAcento(F.busca.trim());
    var l = D.compras.filter(function (c) {
      return (!F.tipo || c.tipo === F.tipo) && (!q || semAcento([c.fornecedor, c.descricao, destinoDe(c), CATS[c.categoria], (c.itens || []).map(function (i) { return i.item; }).join(" ")].join(" ")).indexOf(q) >= 0);
    });
    if (!l.length) { r.innerHTML = '<div class="vazio">Nenhuma compra neste período.' + (F.busca ? "" : " Toque em “Ler nota” para lançar a primeira.") + "</div>"; return; }
    var mat = l.filter(function (c) { return c.tipo === "material"; }), desp = l.filter(function (c) { return c.tipo === "despesa"; });
    function agrupar(fn) { var g = {}; l.forEach(function (c) { var k = fn(c); g[k] = (g[k] || 0) + Number(c.valor); }); return Object.keys(g).map(function (k) { return [k, g[k]]; }).sort(function (a, b) { return b[1] - a[1]; }); }
    var lojas = agrupar(function (c) { return c.fornecedor || "Loja não informada"; }).slice(0, 8);
    var dest = agrupar(function (c) { return c.tipo === "despesa" ? (CATS[c.categoria] || "📦 Outros") : destinoDe(c); }).slice(0, 8);
    r.innerHTML = '<div class="grade"><div class="ladrilho"><div class="r">Total</div><div class="v">' + A.dinheiro(soma(l)) + '</div><div class="d">' + l.length + " lançamento(s)</div></div>" +
      '<div class="ladrilho"><div class="r">Material</div><div class="v">' + A.dinheiro(soma(mat)) + '</div></div><div class="ladrilho"><div class="r">Despesas</div><div class="v">' + A.dinheiro(soma(desp)) + "</div></div></div>" +
      '<div class="duas" style="gap:12px"><div class="cartao"><h3>Por loja</h3>' + lojas.map(function (x) { return '<div class="linha"><span>' + esc(x[0]) + '</span><b class="dir">' + A.dinheiro(x[1]) + "</b></div>"; }).join("") + "</div>" +
      '<div class="cartao"><h3>Para onde foi</h3>' + dest.map(function (x) { return '<div class="linha"><span>' + esc(x[0]) + '</span><b class="dir">' + A.dinheiro(x[1]) + "</b></div>"; }).join("") + "</div></div>" +
      '<div class="acoes" style="margin:0 0 14px"><button id="cp-csv">⬇️ Planilha (CSV)</button></div>' +
      '<div class="lista">' + l.map(function (c) {
        var s = situacao(c);
        return '<button class="item" data-cp="' + c.id + '"><span class="meio"><span class="forte">' + esc(c.tipo === "despesa" ? (CATS[c.categoria] || "Despesa") + (c.fornecedor ? " · " + c.fornecedor : "") : c.fornecedor || "Loja não informada") +
          '</span><span class="mudo peq">' + dataBR(c.comprado_em) + " · " + esc(destinoDe(c)) + ((c.itens || []).length ? " · " + c.itens.length + " ite" + (c.itens.length > 1 ? "ns" : "m") : "") + (c.nota ? " · 📎" : "") +
          '</span></span><span class="fim"><b>' + A.dinheiro(c.valor) + "</b>" + (s ? '<span class="selo ' + s.cls + '">' + esc(s.txt) + "</span>" : "") + "</span></button>";
      }).join("") + "</div>";
    $$("[data-cp]", r).forEach(function (b) { b.onclick = function () { var c = D.compras.find(function (x) { return x.id === b.dataset.cp; }); formulario({ compra: c, dados: c, tipo: c.tipo }); }; });
    $("#cp-csv").onclick = function () { baixarCsv(l); };
  }
  function baixarCsv(l) {
    var c = function (v) { v = String(v === null || v === undefined ? "" : v); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var linhas = [["Data", "Tipo", "Loja", "CNPJ", "Valor", "Forma", "Pago", "Vencimento", "Destino", "Itens"].join(";")];
    l.slice().reverse().forEach(function (x) {
      linhas.push([dataBR(x.comprado_em), x.tipo === "despesa" ? (CATS[x.categoria] || "Despesa").replace(/^\S+ /, "") : "Material", x.fornecedor, x.cnpj, num2(x.valor), (FORMAS[x.forma_pagamento] || "").replace(/^\S+ (?=Fiado)/, ""),
        x.pago ? "sim" : "não", dataBR(x.vencimento), destinoDe(x), (x.itens || []).map(function (i) { return A.numero(i.qtd) + " " + i.un + " " + i.item; }).join(" | ")].map(c).join(";"));
    });
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    a.download = "compras-" + intervalo().ini + ".csv"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }

  // ---------- ler notas ----------
  function receber(fs) {
    if (!X().podeGravar()) { A.avisar(A.msgErro({ message: "row-level security" }), "erro"); return; }
    contexto();
    var fila = fs.slice(0, 20), lidas = [];
    if (fs.length > 20) A.avisar("Vou ler as 20 primeiras notas; mande as outras depois.", "");
    var j = A.janela('<div class="peq" id="cn-st">📖 Lendo a nota... (na primeira vez o leitor é baixado, demora um pouco)</div>', { titulo: "🧾 Nota", fixa: true });
    var st = function (t) { var x = $("#cn-st", j.el); if (x) x.textContent = t; };
    fila.reduce(function (pr, f, i) {
      return pr.then(function () {
        st("📖 Lendo a nota " + (i + 1) + " de " + fila.length + "...");
        L().progresso(function (n) { st("📖 Lendo a nota " + (i + 1) + " de " + fila.length + "... " + n + "%"); });
        return L().lerUmaNota(f, st).then(function (x) { lidas.push(x); }, function () { lidas.push({ dados: {}, imagem: /^image\//.test(f.type) ? f : null, erro: true }); });
      });
    }, Promise.resolve()).then(function () {
      j.fechar();
      var proxima = function () {
        var x = lidas.shift(); if (!x) return;
        var d = x.dados || {}, sa = semAcento((d.fornecedor || "") + " " + (d.itens || []).map(function (i) { return i.item; }).join(" "));
        var desp = !!(d.categoria || L().categoriaPeloTexto(sa));
        formulario({ dados: d, imagem: x.imagem, erro: x.erro, tipo: desp ? "despesa" : "material", depois: proxima, falta: lidas.length });
      };
      proxima();
    });
  }

  // nota já lançada? certa: mesma chave ou mesmo número da mesma loja; provável: mesma loja, valor e data
  function repetida(x, id) {
    var dg = function (v) { return String(v || "").replace(/\D/g, ""); };
    var qs = [];
    if (x.chave) qs.push(sb().from("compras").select("*").eq("chave", dg(x.chave)).limit(1));
    if (x.valor && x.comprado_em) qs.push(sb().from("compras").select("*").eq("comprado_em", x.comprado_em).eq("valor", x.valor).limit(20));
    if (x.numero_nota && x.cnpj) qs.push(sb().from("compras").select("*").eq("numero_nota", x.numero_nota).limit(20));
    return Promise.all(qs).then(function (rs) {
      var l = [].concat.apply([], rs.map(function (r) { return r.data || []; })).filter(function (c) { return c.id !== id; });
      var nm = function (v) { return semAcento(v).replace(/[^a-z0-9]+/g, " ").replace(/\b(ltda|me|epp|eireli|sa|s a|comercio de|com)\b/g, " ").replace(/\s+/g, " ").trim(); };
      var c1 = x.chave && l.find(function (c) { return c.chave === dg(x.chave); });
      if (c1) return { certa: true, c: c1, motivo: "mesma chave de acesso" };
      c1 = x.numero_nota && x.cnpj && l.find(function (c) { return c.numero_nota === x.numero_nota && dg(c.cnpj) === dg(x.cnpj); });
      if (c1) return { certa: true, c: c1, motivo: "mesmo número de nota da mesma loja" };
      c1 = l.find(function (c) { return c.comprado_em === x.comprado_em && Math.abs(Number(c.valor) - Number(x.valor)) < 0.005 && (!x.fornecedor || !c.fornecedor || nm(c.fornecedor) === nm(x.fornecedor) || (x.cnpj && dg(c.cnpj) === dg(x.cnpj))); });
      return c1 ? { certa: false, c: c1, motivo: "mesma loja, mesmo valor e mesma data" } : null;
    }).catch(function () { return null; });
  }

  // ---------- formulário (nova, lida ou editar) ----------
  function formulario(op) {
    var c0 = op.compra || null, d = op.dados || {}, tipo = op.tipo || "material";
    var itens = (d.itens || []).map(function (i) { return { item: i.item || "", qtd: Number(i.qtd) || 1, un: i.un || "un", unit: i.unit != null ? Number(i.unit) : null, valor: i.valor != null ? Number(i.valor) : null }; });
    var forma = c0 ? c0.forma_pagamento : d.forma || "";
    var os = S().servicos.filter(function (s) { return s.status !== "cancelada" && (s.status !== "concluida" || (c0 && c0.servico_id === s.id) || new Date(s.concluida_em) > new Date(Date.now() - 30 * A.DIA)); });
    var prev = op.imagem ? URL.createObjectURL(op.imagem) : "";
    var j = A.janela((op.erro ? '<div class="aviso erro">Não consegui ler esta nota. Preencha à mão' + (prev ? " olhando a foto" : "") + ".</div>" : "") +
      (op.falta ? '<div class="aviso" style="background:var(--sup2)">Depois desta, faltam ' + op.falta + " nota(s).</div>" : "") +
      '<div id="cf-rep"></div>' +
      (prev ? '<a href="' + prev + '" target="_blank" rel="noopener"><img alt="Nota" src="' + prev + '" style="max-height:200px;max-width:100%;border-radius:10px;border:1px solid var(--borda)"></a>' : '<div id="cf-foto"></div>') +
      '<div class="duas"><div><label for="cf-tipo">Tipo</label><select id="cf-tipo"><option value="material">🧰 Material</option><option value="despesa">⛽ Despesa</option></select></div>' +
      '<div id="cf-cat-w"><label for="cf-cat">Categoria</label><select id="cf-cat">' + Object.keys(CATS).map(function (k) { return '<option value="' + k + '">' + CATS[k] + "</option>"; }).join("") + "</select></div></div>" +
      '<div class="duas"><div><label for="cf-loja">Loja / fornecedor</label><input id="cf-loja" maxlength="120" value="' + esc(c0 ? c0.fornecedor || "" : d.fornecedor || "") + '"></div>' +
      '<div><label for="cf-cnpj">CNPJ</label><input id="cf-cnpj" maxlength="20" inputmode="numeric" value="' + esc(c0 ? c0.cnpj || "" : d.cnpj || "") + '"></div></div>' +
      '<div class="tres"><div><label for="cf-data">Data da compra *</label><input id="cf-data" type="date" value="' + esc(c0 ? c0.comprado_em : d.data || hoje()) + '"></div>' +
      '<div><label for="cf-valor">Valor total (R$) *</label><input id="cf-valor" inputmode="decimal" value="' + esc(num2(c0 ? c0.valor : d.valor)) + '"></div>' +
      '<div><label for="cf-forma">Pagamento</label><select id="cf-forma"><option value="">—</option>' + Object.keys(FORMAS).map(function (k) { return '<option value="' + k + '">' + FORMAS[k] + "</option>"; }).join("") + "</select></div></div>" +
      '<div class="duas"><div><label class="check" style="margin-top:14px"><input type="checkbox" id="cf-pago"> Já está paga</label></div>' +
      '<div id="cf-venc-w"><label for="cf-venc">Vencimento</label><input id="cf-venc" type="date" value="' + esc(c0 ? c0.vencimento || "" : "") + '"></div></div>' +
      '<div class="duas" id="cf-dest-w"><div><label for="cf-os">Para qual ordem de serviço</label><select id="cf-os"><option value="">— nenhuma / estoque —</option>' +
      os.map(function (s) { return '<option value="' + s.id + '">' + esc("nº " + s.numero + " · " + s.titulo + (s.cliente_nome ? " · " + s.cliente_nome : "")) + "</option>"; }).join("") + "</select></div>" +
      '<div><label for="cf-dest">Ou escreva o destino</label><input id="cf-dest" maxlength="160" value="' + esc(c0 ? c0.destino || "" : "") + '" placeholder="Ex.: estoque, obra do João"></div></div>' +
      '<label for="cf-desc">Observação</label><input id="cf-desc" maxlength="300" value="' + esc(c0 ? c0.descricao || "" : "") + '">' +
      '<div id="cf-itens-w"><h3 style="margin:14px 0 6px">Itens da nota</h3><div class="cab-cf"><span>Material</span><span>Qtd</span><span>Un</span><span>Unit.</span><span>Total</span><span></span></div>' +
      '<div id="cf-itens" class="itens-orc"></div><div class="acoes" style="margin-top:6px"><button type="button" id="cf-add">+ Item</button></div><div id="cf-soma"></div>' +
      '<label class="check"><input type="checkbox" id="cf-custo" checked> Guardar o preço pago como <b>custo</b> no catálogo (ajuda a fazer orçamento)</label></div>' +
      (d.chave || (c0 && c0.chave) ? '<p class="peq mudo">Chave da nota: ' + esc(c0 ? c0.chave : d.chave) + "</p>" : "") +
      '<div class="acoes"><button class="prim" id="cf-salvar">Salvar</button>' + (op.depois && op.falta ? '<button id="cf-pular">Pular esta</button>' : "") + (c0 ? '<button class="perigo" id="cf-apagar">Apagar</button>' : "") + "</div>",
      { titulo: c0 ? (c0.tipo === "despesa" ? "Despesa" : "Compra") : op.imagem || d.fornecedor ? "Conferir nota" : tipo === "despesa" ? "Nova despesa" : "Nova compra", larga: true, fixa: !!op.imagem });
    var el = j.el;
    $("#cf-tipo", el).value = tipo; $("#cf-cat", el).value = (c0 && c0.categoria) || d.categoria || L().categoriaPeloTexto(semAcento((d.fornecedor || "") + " " + itens.map(function (i) { return i.item; }).join(" "))) || "outros";
    $("#cf-forma", el).value = forma && FORMAS[forma] ? forma : "";
    $("#cf-pago", el).checked = c0 ? c0.pago : !(forma === "boleto" || forma === "fiado" || d.pago === false);
    $("#cf-os", el).value = c0 && c0.servico_id ? c0.servico_id : "";
    if (!c0 && (forma === "fiado")) $("#cf-venc", el).value = vencFiado($("#cf-data", el).value);
    function mostrar() {
      var desp = $("#cf-tipo", el).value === "despesa";
      $("#cf-cat-w", el).classList.toggle("oculto", !desp);
      $("#cf-itens-w", el).classList.toggle("oculto", desp && !itens.length);
      $("#cf-venc-w", el).classList.toggle("oculto", $("#cf-pago", el).checked);
    }
    $("#cf-tipo", el).onchange = mostrar;
    $("#cf-pago", el).onchange = mostrar;
    $("#cf-forma", el).onchange = function () {
      var f = this.value;
      if (f === "boleto" || f === "fiado") { $("#cf-pago", el).checked = false; if (f === "fiado" && !$("#cf-venc", el).value) $("#cf-venc", el).value = vencFiado($("#cf-data", el).value); }
      else if (f) $("#cf-pago", el).checked = true;
      mostrar();
    };
    mostrar();
    if (c0 && c0.nota) sb().storage.from("fotos").createSignedUrls([c0.nota], 3600).then(function (r) {
      var u = r.data && r.data[0] && r.data[0].signedUrl, x = $("#cf-foto", el);
      if (u && x) x.innerHTML = '<a href="' + esc(u) + '" target="_blank" rel="noopener"><img alt="Nota" src="' + esc(u) + '" style="max-height:200px;max-width:100%;border-radius:10px;border:1px solid var(--borda)"></a>';
    });
    function desenharItens() {
      var box = $("#cf-itens", el);
      box.innerHTML = itens.map(function (i, k) {
        return '<div class="linha-cf" data-k="' + k + '"><input class="it" maxlength="200" aria-label="Material" value="' + esc(i.item) + '"><input class="qtd" inputmode="decimal" aria-label="Quantidade" value="' + esc(A.numero(i.qtd)) + '">' +
          '<input class="un" maxlength="10" aria-label="Unidade" value="' + esc(i.un) + '"><input class="unit" inputmode="decimal" aria-label="Preço unitário" value="' + esc(num2(i.unit)) + '">' +
          '<input class="tot" inputmode="decimal" aria-label="Total do item" value="' + esc(num2(i.valor)) + '"><button type="button" class="tirar" aria-label="Tirar">✕</button></div>';
      }).join("") || '<div class="mudo peq">Nenhum item. Pode salvar só com o total.</div>';
      $$(".linha-cf", box).forEach(function (row) {
        var i = itens[Number(row.dataset.k)];
        $(".it", row).oninput = function () { i.item = this.value; };
        $(".qtd", row).oninput = function () { i.qtd = A.lerNumero(this.value) || 1; if (i.unit) { i.valor = Math.round(i.qtd * i.unit * 100) / 100; $(".tot", row).value = num2(i.valor); } conferir(); };
        $(".un", row).oninput = function () { i.un = this.value.trim() || "un"; };
        $(".unit", row).oninput = function () { i.unit = A.lerNumero(this.value) || null; if (i.unit) { i.valor = Math.round(i.qtd * i.unit * 100) / 100; $(".tot", row).value = num2(i.valor); } conferir(); };
        $(".tot", row).oninput = function () { i.valor = A.lerNumero(this.value) || null; if (i.valor && i.qtd) { i.unit = Math.round(i.valor / i.qtd * 100) / 100; $(".unit", row).value = num2(i.unit); } conferir(); };
        $(".tirar", row).onclick = function () { itens.splice(Number(row.dataset.k), 1); desenharItens(); };
      });
      conferir();
    }
    function conferir() {
      var s = Math.round(soma(itens) * 100) / 100, v = A.lerNumero($("#cf-valor", el).value), box = $("#cf-soma", el);
      if (!itens.length) { box.innerHTML = ""; return; }
      var ok = Math.abs(s - v) < 0.05;
      box.innerHTML = '<div class="aviso ' + (ok ? "ok" : "") + '">Soma dos itens: <b>' + A.dinheiro(s) + "</b>" + (ok ? " ✓ bate com o total" : v ? " · total da nota: <b>" + A.dinheiro(v) + "</b>. Confira (pode ter desconto ou frete)" +
        ' <button type="button" class="peq" id="cf-usar-soma">Usar a soma como total</button>' : ' <button type="button" class="peq" id="cf-usar-soma">Usar como total</button>') + "</div>";
      var us = $("#cf-usar-soma", el); if (us) us.onclick = function () { $("#cf-valor", el).value = num2(s); conferir(); };
    }
    $("#cf-valor", el).oninput = conferir;
    $("#cf-data", el).onchange = function () { if ($("#cf-forma", el).value === "fiado") $("#cf-venc", el).value = vencFiado(this.value); };
    $("#cf-add", el).onclick = function () { itens.push({ item: "", qtd: 1, un: "un", unit: null, valor: null }); desenharItens(); var l = $$(".linha-cf .it", el); l[l.length - 1].focus(); };
    desenharItens();
    if (d.valorIncerto && !c0) A.avisar("Confira o valor total: não consegui ler com certeza.", "");
    // aviso de nota repetida logo ao abrir
    var chave = c0 ? c0.chave : d.chave, num = c0 ? c0.numero_nota : d.numero;
    function dadosForm() {
      return { tipo: $("#cf-tipo", el).value, categoria: $("#cf-tipo", el).value === "despesa" ? $("#cf-cat", el).value : null, comprado_em: $("#cf-data", el).value,
        valor: A.lerNumero($("#cf-valor", el).value), fornecedor: $("#cf-loja", el).value.trim() || null, cnpj: $("#cf-cnpj", el).value.trim() || null,
        forma_pagamento: $("#cf-forma", el).value || null, pago: $("#cf-pago", el).checked, vencimento: $("#cf-pago", el).checked ? null : $("#cf-venc", el).value || null,
        servico_id: $("#cf-os", el).value || null, destino: $("#cf-dest", el).value.trim() || null, descricao: $("#cf-desc", el).value.trim() || null,
        chave: chave || null, numero_nota: num || null,
        itens: itens.filter(function (i) { return String(i.item || "").trim(); }).map(function (i) { return { item: A.maiuscula(i.item.trim()), qtd: i.qtd, un: i.un, unit: i.unit, valor: i.valor }; }) };
    }
    var rep = null;
    if (!c0) repetida(Object.assign(dadosForm(), { chave: chave, numero_nota: num })).then(function (r) {
      rep = r; var box = $("#cf-rep", el); if (!box || !r) return;
      box.innerHTML = '<div class="aviso' + (r.certa ? " erro" : "") + '"><b>' + (r.certa ? "⛔ Esta nota já foi lançada" : "⚠️ Parece repetida") + "</b> (" + esc(r.motivo) + "): " + esc(r.c.fornecedor || "loja não informada") + " · " +
        A.dinheiro(r.c.valor) + " · " + dataBR(r.c.comprado_em) + (r.certa ? "." : ". Se for outra compra igual, salve mesmo assim.") + "</div>";
    });
    var bp = $("#cf-pular", el); if (bp) bp.onclick = function () { j.fechar(); op.depois(); };
    $("#cf-salvar", el).onclick = function () {
      var b = this, x = dadosForm();
      if (rep && rep.certa) { A.avisar("Esta nota já foi lançada. Não vou lançar de novo.", "erro"); return; }
      if (!x.comprado_em || !(x.valor > 0)) { A.avisar("Preencha a data e o valor total.", "erro"); return; }
      if (!x.pago && !x.vencimento) { A.avisar("Diga quando vence (ou marque que já está paga).", "erro"); $("#cf-venc", el).focus(); return; }
      A.ocupado(b, true, "Salvando...");
      var pFoto = op.imagem && /^image\//.test(op.imagem.type || "image/jpeg") ? A.reduzirFoto(op.imagem, 1800).then(function (bl) {
        var cam = S().empresa.id + "/compras/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ".jpg";
        return sb().storage.from("fotos").upload(cam, bl, { contentType: "image/jpeg" }).then(function (r) { if (r.error) throw r.error; return cam; });
      }).catch(function (e) { A.avisar("A foto da nota não foi guardada (" + A.msgErro(e) + "). A compra será salva.", "erro"); return null; }) : Promise.resolve(c0 ? c0.nota : null);
      pFoto.then(function (cam) {
        x.nota = cam;
        return (c0 ? sb().from("compras").update(x).eq("id", c0.id) : sb().from("compras").insert(x)).select().single();
      }).then(function (r) {
        if (r.error) throw r.error;
        return ($("#cf-custo", el).checked && x.tipo === "material" ? guardarCustos(x) : Promise.resolve(0)).then(function (n) {
          A.avisar((c0 ? "Salvo." : "Compra lançada.") + (n ? " " + n + " custo(s) atualizado(s) no catálogo." : ""), "ok");
          j.fechar(); atualizar(); if (op.depois) op.depois();
        });
      }).catch(function (e) {
        A.avisar(/compras_chave_idx|duplicate/i.test(e.message || "") ? "Esta nota já foi lançada (mesma chave de acesso)." : A.msgErro(e), "erro"); A.ocupado(b, false);
      });
    };
    var ba = $("#cf-apagar", el);
    if (ba) ba.onclick = function () {
      A.confirmar("Apagar esta compra de " + A.dinheiro(c0.valor) + "?", "Apagar").then(function (ok) {
        if (!ok) return;
        (c0.nota ? sb().storage.from("fotos").remove([c0.nota]) : Promise.resolve()).then(function () { return sb().from("compras").delete().eq("id", c0.id); })
          .then(function (r) { if (r && r.error) throw r.error; A.avisar("Apagada.", "ok"); j.fechar(); atualizar(); }).catch(function (e) { A.avisar(A.msgErro(e), "erro"); });
      });
    };
  }

  // último preço pago -> custo (tabela "custos", que só o gestor vê); cria o material no catálogo se ainda não existe
  function guardarCustos(x) {
    var cat = S().catalogo, n = 0;
    var com = x.itens.filter(function (i) { return Number(i.unit) > 0; });
    if (!com.length) return Promise.resolve(0);
    return sb().from("custos").select("*").then(function (rc) {
      var custos = rc.data || [];
      return com.reduce(function (pr, i) {
        return pr.then(function () {
          var k = chaveItem(i.item), it = cat.find(function (c) { return chaveItem(c.descricao) === k; });
          var pItem = it ? Promise.resolve(it) : sb().from("catalogo").insert({ tipo: "material", descricao: A.maiuscula(i.item), un: i.un || "un", valor: i.unit })   // venda começa igual ao custo
            .select().single().then(function (r) { if (r.error) throw r.error; cat.push(r.data); return r.data; });
          return pItem.then(function (item) {
            var atual = custos.find(function (c) { return c.catalogo_id === item.id; });
            if (atual && atual.comprado_em && atual.comprado_em > x.comprado_em) return;   // já tem um custo mais novo
            return sb().from("custos").upsert({ catalogo_id: item.id, custo: i.unit, loja: x.fornecedor, comprado_em: x.comprado_em }).then(function (r) { if (!r.error) n++; });
          }).catch(function () { /* um item que falhou não impede os outros */ });
        });
      }, Promise.resolve());
    }).then(function () { cat.sort(function (a, b) { return a.descricao.localeCompare(b.descricao, "pt-BR"); }); return n; });
  }
  function custos() { return sb().from("custos").select("*").then(function (r) { return r.data || []; }).catch(function () { return []; }); }

  // gasto com material de uma ordem de serviço (mostrado na ordem)
  function daOS(id) {
    return sb().from("compras").select("valor,fornecedor,comprado_em").eq("servico_id", id).then(function (r) { return r.data || []; }).catch(function () { return []; });
  }

  window.AG_COMPRAS = { tela: tela, daOS: daOS, custos: custos };
})();
