// AGEstor — leitor de comprovantes e notas: foto (OCR em português), PDF ou texto.
// Usado pelos pagamentos da equipe (comprovante Pix) e, depois, pela leitura de notas de compra.
// Os leitores (tesseract.js e pdf.js) só são baixados na primeira vez que alguém lê um arquivo.
(function () {
  "use strict";
  var A = window.AG;
  var MESES = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
  var TESS = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/";
  var PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
  function semAcento(t) { return String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
  function dois(n) { return String(n).padStart(2, "0"); }

  // ---------------- leitura do comprovante ----------------
  var ROT_DEST = /^(destino|destinat[aá]rio|para|recebedor|favorecido|quem recebeu|dados do recebedor|dados de quem recebeu|pago para|transferido para|enviado para)\b[:\s-]*/i;
  var ROT_FIM = /^(origem|pagador|quem pagou|dados do pagador|de)\b/i;
  var NAO_NOME = /cpf|cnpj|institui|banco|ag[eê]ncia|conta|chave|tipo|valor|data|hor[aá]rio|autentica|transa|identifica|comprovante|pix|\d{3}|\*{2}|•/i;
  function limpar(n) { return String(n || "").replace(/\s+/g, " ").replace(/[^A-Za-zÀ-ú.' ]/g, "").trim().slice(0, 120); }
  function pareceNome(x) { return !NAO_NOME.test(x) && /^[A-Za-zÀ-ú][A-Za-zÀ-ú.' ]*\s+[A-Za-zÀ-ú.' ]+$/.test(x.trim()); }
  // nome que o comprovante quebrou em 2 linhas ("MATEUS HENRIQUE SILVA DE" / "PAULA")
  function comContinuacao(ls, k, nome) {
    var prox = ls[k + 1];
    if (prox && /^[A-ZÀ-Ú][A-ZÀ-Ú' ]{1,40}$/.test(prox) && !NAO_NOME.test(prox) && !ROT_FIM.test(prox) && nome === nome.toUpperCase()) return nome + " " + prox;
    return nome;
  }
  function favorecido(ls) {
    for (var i = 0; i < ls.length; i++) {
      var m = ls[i].match(ROT_DEST);
      if (!m) continue;
      var resto = ls[i].slice(m[0].length).replace(/^nome\b[:\s]*/i, "").trim();
      if (resto && pareceNome(resto)) return limpar(resto);
      for (var k = i + 1; k < Math.min(ls.length, i + 8); k++) {
        var x = ls[k];
        if (ROT_FIM.test(x)) break;
        if (/^nome\b/i.test(x)) {
          var v = x.replace(/^nome\b[:\s]*/i, "");
          if (v && pareceNome(v)) return limpar(comContinuacao(ls, k, v));
          if (ls[k + 1] && pareceNome(ls[k + 1])) return limpar(comContinuacao(ls, k + 1, ls[k + 1]));
          continue;
        }
        if (pareceNome(x)) return limpar(comContinuacao(ls, k, x));
      }
    }
    return "";
  }
  // texto do comprovante -> { valor, data (aaaa-mm-dd), hora (hh:mm), favorecido, id }
  function lerPix(texto) {
    var t = String(texto || "").replace(/\r/g, ""), ls = t.split("\n").map(function (x) { return x.trim(); }).filter(Boolean), r = {};
    var mv = t.match(/valor[^\n\d]{0,40}?R\s?[$S5]?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i) || t.match(/R\s?[$S5]\s*(\d{1,3}(?:\.\d{3})*,\d{2})/) || t.match(/\b(\d{1,3}(?:\.\d{3})*,\d{2})\b/);
    if (mv) r.valor = A.lerNumero(mv[1]);
    var md = t.match(/(\d{2})\/(\d{2})\/(\d{4})(?:[^\d\n]{1,8}(\d{2})[:h](\d{2}))?/);
    var mm = semAcento(t).match(/(\d{1,2})\s*(?:de\s+)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?\s*(?:de\s+)?(\d{4})(?:[^\d\n]{1,10}(\d{2})[:h](\d{2}))?/);
    if (md) { r.data = md[3] + "-" + md[2] + "-" + md[1]; if (md[4]) r.hora = md[4] + ":" + md[5]; }
    else if (mm) { r.data = mm[3] + "-" + dois(MESES[mm[2]]) + "-" + dois(mm[1]); if (mm[4]) r.hora = mm[4] + ":" + mm[5]; }
    if (!r.hora) { var mh = t.match(/\b([01]\d|2[0-3])[:h]([0-5]\d)(?::[0-5]\d)?\b/); if (mh) r.hora = mh[1] + ":" + mh[2]; }
    var mi = t.replace(/\s/g, "").match(/E\d{8}[0-9A-Za-z]{23}/);
    if (mi) r.id = mi[0];
    else {
      // "ID da transação" / "Autenticação": o código pode vir quebrado em várias linhas
      // primeiro o "ID da transação" (só números: o leitor de imagem acerta mais), depois a autenticação
      var rotulos = [/^(id da transa|identificador|codigo da transa)/, /^autentica/];
      for (var q = 0; q < rotulos.length && !r.id; q++) for (var i = 0; i < ls.length && !r.id; i++) {
        if (!rotulos[q].test(semAcento(ls[i]))) continue;
        var cod = ls[i].replace(/^[^:]*:?/, "").replace(/[^0-9A-Za-z]/g, "");
        for (var k = i + 1; k < ls.length && /^[0-9A-Za-z ]{6,}$/.test(ls[k]) && !/[a-z]{4,}/.test(ls[k]); k++) cod += ls[k].replace(/\s/g, "");
        if (cod.length >= 16) r.id = cod.slice(0, 80);
      }
    }
    // chave Pix e CPF de quem recebeu (parte "para"): é por eles que o app acha o funcionário
    var mc = t.match(/chave(?:\s+pix)?\s*[:-]?\s*([^\s][^\n]*)/i);
    if (mc) r.chave = mc[1].trim().slice(0, 120);
    var noDestino = false;
    ls.forEach(function (x) {
      if (ROT_DEST.test(x)) noDestino = true; else if (ROT_FIM.test(x)) noDestino = false;
      // CPF mascarado ("***.832.066-**"): guarda só os dígitos que aparecem
      var mcpf = noDestino && x.match(/cpf\b(.*)$/i);
      if (mcpf && !r.cpf) { var vis = mcpf[1].replace(/^[^\d*•"]*/, "").replace(/\D/g, ""); if (vis.length >= 5) r.cpf = vis; }
    });
    r.favorecido = favorecido(ls);
    return r;
  }
  function soDig(x) { return String(x || "").replace(/\D/g, ""); }
  function mesmaChave(a, b) {
    a = String(a || "").trim().toLowerCase(); b = String(b || "").trim().toLowerCase();
    if (!a || !b) return false;
    if (a.indexOf("@") >= 0 || b.indexOf("@") >= 0 || /[a-f0-9]{8}-[a-f0-9]{4}/.test(a)) return a.replace(/\s/g, "") === b.replace(/\s/g, "");
    var da = soDig(a), db = soDig(b);
    return da.length >= 8 && db.length >= 8 && (da === db || da.slice(-8) === db.slice(-8) && Math.min(da.length, db.length) <= 13);
  }
  function cpfConfere(visiveis, cpf) {
    var v = soDig(visiveis), d = soDig(cpf);
    return d.length === 11 && v.length >= 5 && (v === d || d.indexOf(v) >= 0);
  }
  function acharPessoa(fs, nome, chave, cpf) {
    var f = chave && fs.filter(function (x) { return x.pix && mesmaChave(x.pix, chave); })[0];
    if (f) return { f: f, por: "chave Pix" };
    f = cpf && fs.filter(function (x) { return x.pix && cpfConfere(cpf, x.pix); })[0];
    if (f) return { f: f, por: "CPF" };
    var fim = soDig(chave).slice(-8);
    f = fim.length === 8 && fs.filter(function (x) { return soDig(x.telefone).slice(-8) === fim; })[0];
    if (f) return { f: f, por: "telefone" };
    f = acharPorNome(fs, nome);
    return f ? { f: f, por: "nome" } : null;
  }
  function acharPorNome(fs, nome) {
    var tk = semAcento(nome).split(/[^a-z]+/).filter(function (w) { return w.length >= 3 && !/^(dos|das)$/.test(w); });
    if (!tk.length) return null;
    var melhor = null, nota = 0;
    fs.forEach(function (f) {
      var fk = semAcento(f.nome).split(/[^a-z]+/).filter(function (w) { return w.length >= 3; });
      var n = tk.filter(function (w) { return fk.indexOf(w) >= 0; }).length, primeiro = fk[0] === tk[0];
      var sc = n + (primeiro ? 1 : 0);
      if (sc > nota && (n >= 2 || primeiro)) { nota = sc; melhor = f; }
    });
    return melhor;
  }

  // ---------------- arquivos: imagem (OCR), PDF ou texto ----------------
  var scripts = {};
  function carregarScript(url, pronto) {
    if (pronto()) return Promise.resolve();
    if (!scripts[url]) scripts[url] = new Promise(function (ok, falha) {
      var sc = document.createElement("script");
      sc.src = url;
      sc.onload = function () { pronto() ? ok() : falha(new Error("Falha ao carregar o leitor.")); };
      sc.onerror = function () { delete scripts[url]; sc.remove(); falha(new Error("Sem internet para ler o comprovante. Tente de novo.")); };
      document.head.appendChild(sc);
    });
    return scripts[url];
  }
  var leitor = null, progresso = null;
  // op: { psm: "6" (bloco, padrão do tesseract.js) ou "3"/"4" (página/colunas), endireitar: true (corrige foto torta), cinza: true (sem preto e branco), giro: 0/90/270 já conhecido }
  // devolve { texto, giro }
  function ocr(f, op) {
    op = op || {};
    return carregarScript(TESS + "tesseract.min.js", function () { return !!window.Tesseract; }).then(function () {
      if (!leitor) leitor = window.Tesseract.createWorker("por", 1, {
        workerPath: TESS + "worker.min.js", corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1",
        langPath: "https://cdn.jsdelivr.net/npm/@tesseract.js-data/por@1.0.0/4.0.0_best_int",
        logger: function (m) { if (progresso && m.status === "recognizing text") progresso(Math.round(m.progress * 100)); }
      }).catch(function (e) { leitor = null; throw e; });
      return leitor;
    }).then(function (w) {
      // foto deitada (comum em nota grande): se a leitura sai ruim, tenta girada para os dois lados e fica com a melhor
      var ler = function (giro) {
        return w.setParameters({ tessedit_pageseg_mode: op.psm || "6" }).then(function () { return realcar(f, giro, op.cinza, op.endireitar); })
          .then(function (img) { return w.recognize(img); }).then(function (r) { return { texto: r.data.text || "", giro: giro }; });
      };
      if (op.giro !== undefined) return ler(op.giro);
      return ler(0).then(function (t0) {
        if (qualidade(t0.texto) >= 20) return t0;
        return ler(90).then(function (t1) {
          return ler(270).then(function (t2) {
            return [t0, t1, t2].sort(function (a, b) { return qualidade(b.texto) - qualidade(a.texto); })[0];
          });
        });
      });
    });
  }
  // nota de leitura: valores em reais e palavras de verdade
  // nota da leitura: valores em dinheiro e palavras de verdade de nota/comprovante (foto deitada dá só "letras soltas", que não contam)
  var VOCAB = /^(valor|total|nota|fiscal|data|emissao|cnpj|cpf|produto|produtos|descricao|quantidade|quant|unitario|unit|rua|avenida|bairro|cep|municipio|endereco|telefone|fone|pagamento|pix|cartao|dinheiro|troco|documento|eletronica|consumidor|chave|acesso|protocolo|serie|item|codigo|desconto|icms|frete|inscricao|estadual|razao|social|destinatario|emitente|transferencia|comprovante|para|nome|instituicao|banco|agencia|conta|horario|tipo|cupom|venda|cliente|vencimento|fatura|natureza|operacao|tributos|forma|pagto|danfe|saida|entrada|autorizacao|transacao|enviado|recebido|realizado|origem|destino|subtotal|qtde|qtd|vendedor|pedido)$/;
  function qualidade(t) {
    var pal = (semAcento(t).match(/[a-z]+/g) || []).filter(function (x) { return VOCAB.test(x); }).length;
    return (String(t).match(/\d,\d{2}\b/g) || []).length * 2 + pal * 3;
  }
  // foto de papel (sombra, inclinação): amplia, passa para preto e branco pela claridade de cada região. Melhora muito a leitura de notas.
  // foto um pouco torta (papel inclinado): mede o ângulo das linhas de texto (-6° a 6°) pela projeção dos pontos escuros
  // em cada ângulo; o melhor é o que deixa as linhas mais "cheias" e as entrelinhas mais vazias
  function inclinacao(cv) {
    var k = Math.min(1, 900 / Math.max(cv.width, cv.height)), w = Math.round(cv.width * k), h = Math.round(cv.height * k);
    var c2 = document.createElement("canvas"); c2.width = w; c2.height = h;
    var x2 = c2.getContext("2d"); x2.drawImage(cv, 0, 0, w, h);
    var px = x2.getImageData(0, 0, w, h).data, g = new Float32Array(w * h), i;
    for (i = 0; i < w * h; i++) g[i] = px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114;
    // só o texto: ponto bem mais escuro que a vizinhança, em fundo claro (o papel), sem a mesa escura em volta
    var I = new Float64Array((w + 1) * (h + 1)), xs = [], ys = [], r = Math.max(6, Math.round(Math.max(w, h) / 40)), x, y;
    for (y = 0; y < h; y++) { var sl = 0; for (x = 0; x < w; x++) { sl += g[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + sl; } }
    for (y = 0; y < h; y++) {
      var y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
      for (x = 0; x < w; x++) {
        var x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), m = (I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0]) / ((x1 - x0) * (y1 - y0));
        if (m > 110 && g[y * w + x] < m - 30) { xs.push(x - w / 2); ys.push(y); }
      }
    }
    if (xs.length < 500) return 0;
    var melhor = 0, nota = -1;
    for (var a = -6; a <= 6.001; a += 0.25) {
      var t = a * Math.PI / 180, sn = Math.sin(t), cs = Math.cos(t), hist = new Float64Array(h * 2 + 2), n = 0;
      for (i = 0; i < xs.length; i++) { var yy = Math.round(ys[i] * cs - xs[i] * sn) + h; if (yy >= 0 && yy < hist.length) hist[yy]++; }
      for (i = 0; i < hist.length; i++) n += hist[i] * hist[i];
      if (n > nota * 1.0005) { nota = n; melhor = a; }   // empate: fica com o menor giro
    }
    return Math.abs(melhor) >= 0.5 ? melhor : 0;
  }
  function realcar(f, giro, cinza, endireitar) {
    if (!window.createImageBitmap) return Promise.resolve(f);
    return createImageBitmap(f).then(function (bmp) {
      var k = Math.min(2, 3200 / Math.max(bmp.width, bmp.height)), w0 = Math.round(bmp.width * k), h0 = Math.round(bmp.height * k);
      var deitar = giro === 90 || giro === 270, W = deitar ? h0 : w0, H = deitar ? w0 : h0;
      var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      var cx = cv.getContext("2d");
      if (giro) { cx.translate(W / 2, H / 2); cx.rotate(giro * Math.PI / 180); cx.drawImage(bmp, -w0 / 2, -h0 / 2, w0, h0); cx.setTransform(1, 0, 0, 1, 0, 0); }
      else cx.drawImage(bmp, 0, 0, W, H);
      if (bmp.close) bmp.close();
      // endireita a foto torta (leitura extra da nota): as colunas de preço não "sobem" para a linha do material de cima
      var ang = endireitar ? inclinacao(cv) : 0;
      if (ang) {
        var cr = document.createElement("canvas"); cr.width = W; cr.height = H;
        var xr = cr.getContext("2d"); xr.fillStyle = "#fff"; xr.fillRect(0, 0, W, H);
        xr.translate(W / 2, H / 2); xr.rotate(-ang * Math.PI / 180); xr.drawImage(cv, -W / 2, -H / 2);
        cv = cr; cx = xr; cx.setTransform(1, 0, 0, 1, 0, 0);
      }
      var d = cx.getImageData(0, 0, W, H), px = d.data, g = new Float32Array(W * H), I = new Float64Array((W + 1) * (H + 1)), x, y;
      for (var i = 0; i < W * H; i++) g[i] = px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114;
      if (cinza) {   // só tons de cinza (a 2ª leitura de nota usa assim)
        for (i = 0; i < W * H; i++) px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = g[i];
        cx.putImageData(d, 0, 0);
        return new Promise(function (ok) { cv.toBlob(function (b) { ok(b || f); }, "image/png"); });
      }
      for (y = 0; y < H; y++) { var sl = 0; for (x = 0; x < W; x++) { sl += g[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + sl; } }
      var r = Math.max(8, Math.round(Math.max(W, H) / 60));
      for (y = 0; y < H; y++) {
        var y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1);
        for (x = 0; x < W; x++) {
          var x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1);
          var m = (I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0));
          var v = g[y * W + x] < m - 12 ? 0 : 255, o = (y * W + x) * 4;
          px[o] = px[o + 1] = px[o + 2] = v;
        }
      }
      cx.putImageData(d, 0, 0);
      return new Promise(function (ok) { cv.toBlob(function (b) { ok(b || f); }, "image/png"); });
    }).catch(function () { return f; });
  }
  // tabela de materiais de um PDF digital (orçamento ou nota gerada pelo sistema da loja): usa a POSIÇÃO de cada texto na
  // página. Acha o cabeçalho (Descrição, Quantidade, Unidade, Valor unitário, Total), põe cada número na sua coluna e junta
  // a descrição que a loja quebrou em 2 linhas. Devolve { itens, total } ou null se não achar a tabela.
  function tabelaDoPdf(pecas) {
    var P = pecas.filter(function (p) { return p.s.trim(); });
    var acha = function (re) { return P.filter(function (p) { return re.test(p.s.trim()); }); };
    var cab = null;
    acha(/^descri[cç][aã]o|^produto|^material|^mercadoria/i).some(function (d) {
      var mesma = function (re) { return P.filter(function (p) { return Math.abs(p.y - d.y) < 4 && re.test(p.s.trim()); })[0] || null; };
      var q = mesma(/^(quant|qtd|qtde|qde)/i), t = mesma(/^(valor\s*)?total|^vl\.?\s*total|^subtotal/i);
      if (q && t) { cab = { y: d.y, desc: d, qtd: q, tot: t, un: mesma(/^(un|und|unid|unidade|u\.?m\.?)\.?$/i), unit: mesma(/unit|^valor\s*un|^vl\.?\s*un|^pre[cç]o|^v\.?\s*un/i),
        extra: mesma(/^desc\.\s*\/|acr[eé]sc|^desconto$|^ipi$|^icms$/i) };   // "extra": coluna que não interessa, mas recebe números
        return true;
      }
      return false;
    });
    if (!cab) return null;
    var num = /^-?\d{1,3}(?:\.\d{3})*(?:,\d{1,4})?$|^-?\d+(?:,\d{1,4})?$/;
    var colunas = ["qtd", "un", "unit", "extra", "tot"].filter(function (k) { return cab[k]; }).map(function (k) { return { k: k, c: cab[k].x + cab[k].w / 2 }; });
    var fimY = -1e9;   // a tabela acaba no primeiro "Total ..." abaixo do cabeçalho que não é a coluna Total
    P.forEach(function (p) { if (p.y < cab.y - 4 && /^(total|valor total|sub-?total|desconto|forma de pag|observa)/i.test(p.s.trim()) && p.y > fimY && p !== cab.tot) fimY = p.y; });
    var corpo = P.filter(function (p) { return p.y < cab.y - 4 && p.y > fimY + 2; });
    // linhas: onde há quantidade na coluna "Quantidade"
    var colDe = function (p) { var cx = p.x + p.w / 2, m = null, dm = 1e9; colunas.forEach(function (c) { var d = Math.abs(c.c - cx); if (d < dm) { dm = d; m = c.k; } }); return m; };
    var linhas = [];
    corpo.forEach(function (p) {
      var s = p.s.trim();
      // só número que está mesmo embaixo de "Quantidade" (não um código no meio da descrição)
      if (num.test(s) && colDe(p) === "qtd" && p.x + p.w > cab.qtd.x - 10 && !linhas.some(function (l) { return Math.abs(l.y - p.y) < 2; })) linhas.push({ y: p.y, qtd: A.lerNumero(s), desc: [] });
    });
    if (!linhas.length) return null;
    linhas.sort(function (a, b) { return b.y - a.y; });
    var gaps = linhas.slice(1).map(function (l, i) { return linhas[i].y - l.y; }).sort(function (x, y) { return x - y; });
    var passo = gaps.length ? Math.max(6, gaps[Math.floor(gaps.length / 2)]) : 12;   // espaço típico entre linhas (mediana)
    var maisPerto = function (y) { var m = null, dm = 1e9; linhas.forEach(function (l) { var d = Math.abs(l.y - y); if (d < dm) { dm = d; m = l; } }); return dm <= passo * 0.75 ? m : null; };
    corpo.forEach(function (p) {
      var s = p.s.trim(), l = maisPerto(p.y); if (!l) return;
      var limiteDesc = cab.qtd.x - 2;
      if (/[A-Za-zÀ-ú]/.test(s) && p.x >= cab.desc.x - 25 && p.x < limiteDesc) { l.desc.push(p); return; }
      if (cab.un && colDe(p) === "un" && /^[A-Za-z²³]{1,5}\.?$/.test(s)) { l.un = s.toLowerCase().replace(/\.$/, ""); return; }
      if (num.test(s)) { var k = colDe(p); if (k === "unit" && l.unit == null) l.unit = A.lerNumero(s); else if (k === "tot") l.valor = A.lerNumero(s); }
    });
    var itens = linhas.map(function (l) {
      var item = l.desc.sort(function (a, b) { return b.y - a.y || a.x - b.x; }).map(function (p) { return p.s.trim(); }).join(" ").replace(/\s+/g, " ").trim();
      var r = { item: item.slice(0, 160), qtd: l.qtd, un: l.un || "un", unit: l.unit != null ? Math.round(l.unit * 100) / 100 : null, valor: l.valor != null ? l.valor : null };
      if (r.valor == null && r.unit) r.valor = Math.round(r.qtd * r.unit * 100) / 100;
      if (r.unit == null && r.valor && r.qtd) r.unit = Math.round(r.valor / r.qtd * 100) / 100;
      return r;
    }).filter(function (r) { return r.item && r.qtd > 0; });
    if (!itens.length) return null;
    // total a pagar: "Total líquido" / "Total a pagar" / "Valor total" e o número logo abaixo (ou ao lado)
    var total = null;
    acha(/total\s*l[ií]quido|total\s*a\s*pagar|valor\s*total\s*(da\s*nota|a\s*pagar)?$|^total\s*geral|^total\s*da\s*(nota|venda|proposta)/i).some(function (h) {
      if (h.y >= cab.y - 4) return false;
      var cand = P.filter(function (p) { return num.test(p.s.trim()) && /,\d{2}$/.test(p.s.trim()) && ((p.y < h.y && h.y - p.y < 25 && Math.abs((p.x + p.w) - (h.x + h.w)) < 60) || (Math.abs(p.y - h.y) < 4 && p.x > h.x + h.w - 2)); })
        .sort(function (a, b) { return Math.abs(a.y - h.y) - Math.abs(b.y - h.y) || a.x - b.x; });
      if (cand.length) { total = A.lerNumero(cand[0].s.trim()); return true; }
      return false;
    });
    return { itens: itens, total: total };
  }
  function lerPdf(f) {
    return carregarScript(PDFJS + "pdf.min.js", function () { return !!window.pdfjsLib; }).then(function () {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.js";
      return f.arrayBuffer();
    }).then(function (buf) { return window.pdfjsLib.getDocument({ data: buf }).promise; }).then(function (doc) {
      return doc.getPage(1).then(function (pg) {
        return pg.getTextContent().then(function (tc) {
          // junta os pedaços por linha (mesma altura na página)
          var linhas = [], ultY = null;
          tc.items.forEach(function (it) {
            var y = Math.round(it.transform[5]);
            if (ultY === null || Math.abs(y - ultY) > 3) linhas.push(it.str); else linhas[linhas.length - 1] += " " + it.str;
            ultY = y;
          });
          // e a tabela pela posição na página (orçamento de loja com as colunas fora de ordem no texto)
          var tabela = null;
          try { tabela = tabelaDoPdf(tc.items.map(function (it) { return { s: it.str, x: it.transform[4], y: it.transform[5], w: it.width || 0 }; })); } catch (e) { tabela = null; }
          // a primeira página vira imagem para guardar como comprovante
          var vp = pg.getViewport({ scale: 1.6 }), cv = document.createElement("canvas");
          cv.width = vp.width; cv.height = vp.height;
          return pg.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise.then(function () {
            return new Promise(function (ok) { cv.toBlob(function (b) { ok({ texto: linhas.join("\n"), imagem: b, tabela: tabela }); }, "image/jpeg", 0.85); });
          });
        });
      });
    });
  }
  function textoDoArquivo(f, op) {
    if (/pdf/.test(f.type) || /\.pdf$/i.test(f.name || "")) return lerPdf(f);
    if (/^image\//.test(f.type)) return ocr(f, op).then(function (o) { return { texto: o.texto, imagem: f, giro: o.giro }; });
    return f.text().then(function (t) { return { texto: t, xml: /xml/i.test(f.type) || /\.xml$/i.test(f.name || "") || /<infNFe/i.test(t) }; });
  }


  // ===================== 🧾 NOTAS DE COMPRA (NF-e, NFC-e, cupom, DANFE) =====================
  // contexto da empresa logada: o próprio CNPJ e nome (destinatário na nota, não é a loja) e CNPJs de lojas já usadas
  var CTX = {};
  function contexto(c) { CTX = c || {}; }
  function iso(d) { return d.getFullYear() + "-" + dois(d.getMonth() + 1) + "-" + dois(d.getDate()); }
  function dig(x) { return String(x || "").replace(/\D/g, ""); }
  function fmtCnpj(c) { c = dig(c); return c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : c; }
  function fmtFone(t) {
    var n = dig(t).replace(/^55(?=\d{10,11}$)/, "");
    return n.length === 11 ? "(" + n.slice(0, 2) + ") " + n.slice(2, 7) + "-" + n.slice(7) : n.length === 10 ? "(" + n.slice(0, 2) + ") " + n.slice(2, 6) + "-" + n.slice(6) : String(t || "");
  }
  // CNPJ, telefone e e-mail da loja no texto da nota (o que vem antes do "destinatário")
  function dadosLoja(texto) {
    var t = String(texto || ""), proprio = dig(CTX.cnpj), iD = t.search(/destinat/i), r = {};
    var parteLoja = iD > 0 ? t.slice(0, iD) : t.slice(0, 1500);
    var re = /\d{2}[.,\s]?\d{3}[.,\s]?\d{3}\s?\/\s?\d{4}\s?-?\s?\d{2}/g, m, achados = [];
    while ((m = re.exec(t))) { var c = dig(m[0]); if (cnpjOk(c) && c !== proprio) achados.push({ c: c, antes: m.index < iD || iD < 0 }); }
    var ac = achados.filter(function (x) { return x.antes; })[0] || achados[0];
    if (ac) r.cnpj = fmtCnpj(ac.c);
    var mt = parteLoja.match(/(?:fone|tel\w*|whats\w*|zap)[^\d\n]{0,8}(\(?\d{2}\)?\s?\d{4,5}[\s.-]?\d{4})/i);
    if (mt) r.telefone = fmtFone(mt[1]);
    var me = parteLoja.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/);
    if (me && me[0].toLowerCase() !== String(CTX.email || "").toLowerCase()) r.email = me[0].toLowerCase();
    return r;
  }
  var DIN = /\d{1,3}(?:\.\d{3})*,\d{2}/;
  function lerNota(texto) {
    var t = String(texto || "").replace(/\r/g, ""), ls = t.split("\n").map(function (x) { return x.trim(); }).filter(Boolean), r = { itens: [] };
    // foto do cupom: o total do item caiu sozinho na linha de baixo ("... 2 UN 289,90" / "579,80"): volta para a linha do item
    ls = ls.reduce(function (acc, x) {
      var ant = acc[acc.length - 1];
      if (ant && /^\d{1,3}(?:\.\d{3})*,\d{2}$/.test(x) && /^\d{1,6}\s+.*[A-Za-zÀ-ú]{3,}.*\s(?:\d+(?:[.,]\d+)?\s+(?:un|und|pc|pç|mt|m|kg|cx|l|lt|rl|gl|jg|par|pct)|(?:un|und|pc|pç|mt|m|kg|cx|l|lt|rl|gl|jg|par|pct)\.?\s+\d+(?:[.,]\d+)?)\.?\s+\d{1,3}(?:\.\d{3})*,\d{2,3}$/i.test(ant)) acc[acc.length - 1] = ant + " " + x;
      else acc.push(x);
      return acc;
    }, []);
    // valores em reais (sem pegar pedaço de CNPJ "17.134,491/0001-66")
    var valores = function (x) { return (x.match(/\d{1,3}(?:\.\d{3})*,\d{2}(?![\d\/])/g) || []).map(A.lerNumero); };
    // total: rótulo forte ("TOTAL DA NOTA", "TOTAL A PAGAR") aceita o número na linha vizinha (DANFE: rótulos numa linha,
    // números na de baixo); rótulo fraco ("VALOR TOTAL", "TOTAL") só com o número na mesma linha; depois a fatura/parcela
    var forteT = /total\s*da\s*nota|total\s+a\s+pagar|valor\s+a\s+pagar|valor\s+pago/i;
    var fracoT = /valor\s+total(?!\s+dos?\s+(?:produtos|servi))|total\s+(?:geral|r\$)|^\W*total\b(?!\s+(?:bruto|de\s+itens|dos))|\btotal\s*:?\s*(?:r\$\s*)?(?:\d{1,3}(?:\.\d{3})*,\d{2}|\d{1,4}\.\d{2})(?![\d,.])\D{0,4}$/i;
    var achou = null, pos = function (v) { return v.filter(function (n) { return n > 0; }); };
    // junto do rótulo do total a foto costuma trocar 5 por S e a vírgula por ponto ("s4.00" = 54,00)
    var valoresT = function (x) {
      return valores(x.replace(/(^|[\s:|;=-])[sS](?=\d[.,]\d{2}(?!\d))/g, function (m, a1) { return a1 + "5"; })
        .replace(/(^|[^\d.,\/])(\d{1,4})\.(\d{2})(?![\d.,\/])/g, function (m, a1, n, c) { return a1 + n + "," + c; }));
    };
    ls.forEach(function (x, i) {
      var v;
      if (forteT.test(x)) {
        v = pos(valoresT(x.slice(x.search(forteT))));
        var naLinha = v.length > 0;
        [i + 1, i - 1, i + 2].forEach(function (k) { if (!v.length && ls[k]) v = pos(valoresT(ls[k])); });
        if (v.length) { achou = v[v.length - 1]; r.naLinha = naLinha; }
      } else if (achou === null && fracoT.test(x)) {
        v = pos(valoresT(x.slice(x.search(fracoT))));
        if (v.length) { r.valorFraco = v[v.length - 1]; r.naLinha = true; }
      }
    });
    if (achou === null && r.valorFraco) achou = r.valorFraco;
    delete r.valorFraco;
    if (achou === null) { var mf = t.match(/(?:fatura|parcela|vencimento|duplicata)[^\n]*?valor[^\d\n]{0,12}(\d{1,3}(?:\.\d{3})*,\d{2})(?![\d\/])/i); if (mf) achou = A.lerNumero(mf[1]); }
    if (achou !== null) r.valor = achou;
    else { var todos = valoresT(t); if (todos.length) { r.valor = Math.max.apply(null, todos); r.valorIncerto = true; } }   // aceita "219.68" (ponto no lugar da vírgula)
    // data: só datas possíveis (o "12.741/2012" da lei vira "12/41/2012" na foto); a de "Emissão" tem preferência
    var datas = [], reD = /(\d{2})\/(\d{2})\/(\d{4}|\d{2})\b/g, md2;
    while ((md2 = reD.exec(t))) {
      var ano = md2[3].length === 2 ? 2000 + Number(md2[3]) : Number(md2[3]), mes = Number(md2[2]), dia = Number(md2[1]);
      if (ano >= 2020 && ano <= new Date().getFullYear() + 1 && mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31)
        datas.push({ iso: ano + "-" + md2[2] + "-" + md2[1], emissao: /emiss/i.test(t.slice(Math.max(0, md2.index - 40), md2.index)) });
    }
    // a foto às vezes lê "2026" como "2020": havendo datas recentes (último ano), as antigas não contam
    var lim = iso(new Date(Date.now() - 400 * 864e5)), recentes = datas.filter(function (x) { return x.iso >= lim; });
    if (recentes.length) datas = recentes;
    else {
      // só datas antigas: "2020" pode ser "2026" com o 6 lido como 0 — troca o último número do ano pelo do ano atual se a data ficar recente
      var hoje = iso(new Date()), anoH = String(new Date().getFullYear());
      var corrigidas = datas.map(function (x) { var c = anoH.slice(0, 3) + anoH[3] + x.iso.slice(4); return c <= hoje && c >= lim && x.iso.slice(0, 3) === anoH.slice(0, 3) ? { iso: c, emissao: x.emissao } : null; }).filter(Boolean);
      if (corrigidas.length) { datas = corrigidas; r.dataCorrigida = true; }
    }
    var dEm = datas.filter(function (x) { return x.emissao; })[0] || datas[0];
    if (dEm) r.data = dEm.iso; else r.semData = true;
    // loja: a linha com o nome antes do CNPJ (ou a primeira linha com letras)
    var iC = -1, proprio = String(CTX.cnpj || "").replace(/\D/g, "");
    for (var i = 0; i < ls.length; i++) if (/cnpj/i.test(ls[i])) { iC = i; break; }
    // tira da linha o que não é nome (título da nota, CEP, telefone, endereço) e o pedaço solto no fim ("LIDER TINTAS L")
    var limparNome = function (x) {
      return x.replace(/^\s*(denomina[cç][aã]o|raz[aã]o\s+social|nome\s+fantasia|nome\s+empresarial|emitente|fornecedor)\s*:?\s*/i, "").replace(/\b(documento auxiliar|nota fiscal|danfe|nfc-?e|consulta|chave de acesso|0\s*-\s*entrada|1\s*-\s*sa[ií]da)\b.*$/i, "")
        .replace(/\b(cep|fone|tel|telefone|cnpj|ie|rua|r\.|av\.?|avenida|rodovia)\b.*$/i, "").replace(/[^A-Za-zÀ-ú0-9&.' -]/g, " ")
        .replace(/\s+\S$/, "").replace(/\s+/g, " ").trim();
    };
    var cand = ls.slice(0, iC > 0 ? iC + 1 : Math.min(10, ls.length)).map(limparNome).filter(function (x) {
      return /[A-Za-zÀ-ú]{3,}\s+[A-Za-zÀ-ú]{2,}/.test(x) && !/destinat|remetente|protocolo|emitente|identifica|natureza|^\W*endere[cç]o/i.test(x) && !(CTX.nome && semAcento(x).indexOf(semAcento(CTX.nome).slice(0, 12)) >= 0) &&
        !(proprio && x.replace(/\D/g, "").indexOf(proprio) >= 0);   // a linha da AGE (destinatário) não é a loja
    });
    // de preferência a linha com cara de razão social (LTDA, EIRELI...; depois COMÉRCIO, TINTAS, MATERIAIS...)
    var forte = /\b(ltda|eireli|epp)\b|\bs\.a\.|\bs\/a\b|\bme\s*$/i;
    var razao = cand.filter(function (x) { return forte.test(x); })[0] ||
      cand.filter(function (x) { return /\b(comercio|comercial|materiais|tintas|eletric\w*|constru\w*|home|deposito|ferragens|distribuidora)\b/i.test(x); })[0];
    // sem razão social reconhecível: melhor deixar em branco (você escolhe na lista) do que gravar um nome errado
    var limpo = function (x) { var sem = x.replace(/\s/g, ""); return sem.length && (sem.match(/[A-Za-zÀ-ú]/g) || []).length / sem.length >= 0.85; };
    var endereco = /\b(contagem|horizonte|betim|ibirit\w*|industrial|bairro|centro|mg|sp|rj|loja\s*\d+|n[ºo°]\s*\d)\b|\d{3,}/i;
    var f0 = razao || cand.slice(0, 3).filter(function (x) { return limpo(x) && !endereco.test(x) && (x.match(/[A-Za-zÀ-ú]{4,}/g) || []).length >= 2 && x.split(/\s+/).length <= 5; })[0];
    // nome dentro de uma linha suja: "COMERCIAL MARTINS", "CASA DO ELETRICISTA", "LIDER TINTAS"...
    var mk = !forte.test(f0 || "") && (f0 || "").match(/\b(?:COMERCIAL|COMERCIO|DEP[OÓ]SITO|CASA|MATERIAIS|DISTRIBUIDORA|FERRAGENS|[A-ZÀ-Ú]{3,}\s+TINTAS|TINTAS)(?:\s+(?:D[AEO]S?\s+)?[A-ZÀ-Ú]{3,}){0,2}/);
    if (mk) f0 = mk[0];
    if (f0) {
      var mr = forte.test(f0) && f0.match(/[A-ZÀ-Ú0-9&.' -]*?\b(?:LTDA|EIRELI|EPP|S\.A\.|S\/A|ME)\b\.?/i);
      // sujeira antes do nome na foto ("Bugs. Na Rodol Ltda"): sai palavra terminada em pontuação e pedaço de 2 letras
      var wf = (mr ? mr[0] : f0).replace(/\s+/g, " ").trim().split(" ");
      while (wf.length > 2 && wf[1] !== "&" && wf[0] !== "&" && (/[.:;,!]$/.test(wf[0]) || /^[A-ZÀ-Ú][a-zà-ú]$/.test(wf[0]) || /^[a-zà-ú]{1,3}$/.test(wf[0]) || /^[A-ZÀ-Ú]{1,2}$/.test(wf[0]))) wf.shift();   // "R & R ELETRO" fica inteiro
      r.fornecedor = wf.join(" ").replace(/\s+(?:N[º°o.]?\s*\d|\d{4}\b).*$/i, "").replace(/[\s-]+$/, "").slice(0, 120);
      if (!/[A-Za-zÀ-ú]{3,}/.test(r.fornecedor)) delete r.fornecedor;
    }
    // CNPJ da loja (válido e que não é o da AGE, que aparece como destinatário), telefone e e-mail da loja
    if (true) {
      var lj = dadosLoja(t);
      if (lj.cnpj) r.cnpj = lj.cnpj;
      if (lj.telefone || lj.email) r.loja = { telefone: lj.telefone || "", whatsapp: lj.whatsapp || "", email: lj.email || "" };
    } else { var mcnpj = t.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/); if (mcnpj) r.cnpj = mcnpj[0]; }
    // itens: "001 CABO FLEX 2,5MM 1 UN 189,90" (código, descrição, quantidade, unidade ... valor)
    // item em 2 linhas (cupom NFC-e): "604 PRO-TECH EPOXI AMARELO" / "2,00 UN 330,44 660,88"
    ls.forEach(function (x, i) {
      // a foto do cupom traz sujeira em volta: pega o nome em MAIÚSCULAS depois do código e, na linha de baixo, "qtd UN unitário total"
      var md1 = x.match(/(?:^|\s)\d{3,6}\s+[|—–-]?\s*([A-ZÀ-Ú][A-ZÀ-Ú0-9 ,.\/"'-]{5,}[A-ZÀ-Ú0-9"])/), prox = ls[i + 1] || "";
      var mq = md1 && !/\d,\d{2}/.test(x) && !/total|subtotal|desconto|pagamento|cart[aã]o/i.test(x) && prox.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*(UN|GL|L|M|KG|CX|PC|PCT|RL|LT|LATA|BD|PAR)\b.*?(\d{1,3}(?:\.\d{3})*,\d{2})\s+.*?(\d{1,3}(?:\.\d{3})*,\d{2})/i);
      if (mq) {
        var q = mq[1].indexOf(",") < 0 && mq[1].indexOf(".") < 0 && mq[1].length >= 3 && /00$/.test(mq[1]) ? Number(mq[1]) / 100 : A.lerNumero(mq[1]);
        r.itens.push({ item: md1[1].replace(/\s+/g, " ").trim().slice(0, 120), qtd: q, un: /^g/i.test(mq[2]) ? "galão" : "un", valor: A.lerNumero(mq[4]) });
      }
    });
    // DANFE: "00000069 IT R SUPERMAC 200 5 LTS 34029090 000 5101 UN 1,0000 52,300000 52,30 ..." (código, descrição, NCM ... unidade, qtd, unitário, total)
    // a foto traz sujeira nas colunas ("|", "[", "="); a coluna do total às vezes some: total = quantidade × unitário
    ls.forEach(function (x, i) {
      var l = x.replace(/[|\[\]“”"=_]/g, " ").replace(/\s+/g, " ").trim();
      var md = l.match(/^\W*\d{3,14}\s+([A-Za-zÀ-ú].*?)\s+\d{8}(?!\d)(.*)$/);
      var mu = md && md[2].match(/\b(UN|UND|PC|PCT|M|MT|KG|CX|RL|LT|L|GL|LATA|BD|PAR)\b(.*)$/i);
      var ns = mu ? (mu[2].match(/\d{1,3}(?:\.\d{3})*,\d{2,6}/g) || []).map(A.lerNumero) : [];
      if (ns.length < 2 || !(ns[0] > 0) || !(ns[1] > 0)) return;
      var qtd = ns[0], unit = ns[1], tot = null;
      for (var k = 2; k < ns.length && tot === null; k++) if (Math.abs(ns[k] - qtd * unit) < 0.05) tot = ns[k];
      // a quantidade sumiu e o 1º número é o unitário: "43,21 172,84" = 4 × 43,21 (o total é múltiplo exato do unitário)
      if (tot === null && Math.round(qtd * 100) % 100 !== 0) {
        var razao = unit / qtd;
        if (razao >= 1 && razao <= 999 && Math.abs(razao - Math.round(razao)) < 0.005) { tot = unit; unit = qtd; qtd = Math.round(razao); }
      }
      if (tot === null) tot = Math.round(qtd * unit * 100) / 100;
      r.itens.push({ item: md[1].replace(/\s+/g, " ").trim().slice(0, 120), qtd: qtd, un: mu[1].toLowerCase().replace("und", "un"), unit: unit, valor: tot });
      ls[i] = "";
    });
    // "002637 1,00 UN ESMALTE CORALIT 3,6L AMARELO 49,90 49,90" (código, quantidade, unidade, descrição, unitário, total)
    ls.forEach(function (x, i) {
      var m3 = x.match(/^\W*\d{3,8}\s+(\d+(?:[.,]\d+)?)\s*(UN|UND|PC|PÇ|PCT|M|MT|KG|CX|RL|LT|L|GL|LATA|BD|PAR)\s+([A-Za-zÀ-ú].*?)\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s*$/i);
      if (m3) { r.itens.push({ item: m3[3].replace(/\s+/g, " ").slice(0, 120), qtd: A.lerNumero(m3[1]), un: m3[2].toLowerCase().replace("und", "un"), valor: A.lerNumero(m3[5]) }); x = ""; return; }
      // o mesmo formato com a foto ruim (pré-venda): "003462 400 UN ROLOANTIGOTASCM oo 21,90 Bro" — a vírgula da quantidade sumiu (400 = 4,00),
      // sujeira depois do nome e o total ilegível ("21 80", "Bro"): o total vale se bater com qtd × unitário, senão é calculado
      var m4 = x.match(/^\W*(?=[0-9A-Za-z]*\d[0-9A-Za-z]*\d)[0-9A-Za-z]{4,8}\s+(?:[—–-]+\s+)?(\d{1,4}(?:[.,]\d{1,3})?)\s*(UN|UND|PC|PÇ|PCT|M|MT|KG|CX|RL|LT|GL|LATA|BD|PAR)\b\.?\s+([A-ZÀ-Ú0-9].*)$/);
      if (!m4) return;
      var q4 = /[.,]/.test(m4[1]) ? A.lerNumero(m4[1]) : m4[1].length >= 3 && /00$/.test(m4[1]) ? Number(m4[1]) / 100 : Number(m4[1]);
      // preço unitário: o 1º valor depois do nome (a foto troca a vírgula por ponto: "12.90"); pode faltar (fica para você completar)
      var mp4 = m4[3].match(/(?:^|\s)(\d{1,3}(?:\.\d{3})*,\d{2}|\d{1,4}\.\d{2})(?![\d,.])/), u4 = mp4 ? A.lerNumero(mp4[1].replace(/^(\d{1,4})\.(\d{2})$/, "$1,$2")) : null;
      var antes4 = mp4 ? m4[3].slice(0, mp4.index) : m4[3], depois4 = mp4 ? m4[3].slice(mp4.index + mp4[0].length) : "";
      var w4 = antes4.replace(/[|"'“”]/g, " ").split(/\s+/), d4 = [];
      for (var k4 = 0; k4 < w4.length; k4++) { if (!w4[k4]) continue; if (/[a-zà-ú]/.test(w4[k4]) || /[—–_]/.test(w4[k4]) || !/[A-ZÀ-Ú0-9]/.test(w4[k4])) break; d4.push(w4[k4]); }
      var mt4 = depois4.match(/(\d{1,3}(?:\.\d{3})*)[ ,.](\d{2})(?!\d)/), t4 = mt4 ? A.lerNumero(mt4[1] + "," + mt4[2]) : null;
      if (u4 > 0 && !(t4 && Math.abs(t4 - q4 * u4) < 0.05)) t4 = Math.round(q4 * u4 * 100) / 100;
      if (!(u4 > 0)) { u4 = null; t4 = null; }
      while (d4.length > 1 && /^\d{1,2}[º°.]*$/.test(d4[d4.length - 1])) d4.pop();   // número solto no fim ("TRINCHA396-2 1º.")
      // total do item na linha vizinha (foto torta): confirma qtd × unitário ou corrige a quantidade lida errado ("700" no lugar de "100")
      if (u4 > 0 && !(mt4 && Math.abs(A.lerNumero(mt4[1] + "," + mt4[2]) - q4 * u4) < 0.05)) {
        var viz = [ls[i - 1], ls[i + 1]].filter(function (z) { return z && !/^\W*(?=[0-9A-Za-z]*\d[0-9A-Za-z]*\d)[0-9A-Za-z]{4,8}\s+\d/.test(z) && !/[A-Za-zÀ-ú]{4,}/.test(z); })
          .map(function (z) { return (z.match(/\d{1,4}[ ,.]\d{2}(?!\d)/g) || []).map(function (n) { return A.lerNumero(n.replace(/[ .](\d{2})$/, ",$1")); }); });
        var tv = [].concat.apply([], viz), ok4 = tv.some(function (n) { return Math.abs(n - q4 * u4) < 0.05; });
        if (!ok4) { var q5 = tv.map(function (n) { return n / u4; }).filter(function (qq) { return qq >= 1 && qq <= 999 && Math.abs(qq - Math.round(qq)) < 0.01 && String(Math.round(qq)).length === String(Math.round(q4)).length; })[0];
          if (q5) { q4 = Math.round(q5); t4 = Math.round(q4 * u4 * 100) / 100; } }
      }
      if (d4.length && q4 > 0 && q4 <= 999) r.itens.push({ item: d4.join(" ").slice(0, 120), qtd: q4, un: m4[2].toLowerCase().replace("und", "un"), unit: u4, valor: t4 });
    });
    ls.forEach(function (x) {
      // a quantidade é a última "N UN" antes do preço ("100M" no nome do cabo não é a quantidade)
      var mi = x.match(/^(?:\d{1,4}\s+)?(?:\d{4,14}\s+)?([A-Za-zÀ-ú][^\n]*)\s+(\d+(?:[.,]\d+)?)\s*(UN|UND|PC|PÇ|PCT|M|MT|M2|KG|CX|RL|LT|L|GL|LATA|BD|PAR)\s+(?:[^\n]*?\s)?(\d{1,3}(?:\.\d{3})*,\d{2})\s*$/i);
      if (mi && !/total|subtotal|desconto|troco|pagamento|cart[aã]o|dinheiro/i.test(x))
        r.itens.push({ item: mi[1].replace(/\s+/g, " ").slice(0, 120), qtd: A.lerNumero(mi[2]), un: mi[3].toLowerCase().replace("und", "un").replace("mt", "m"), valor: A.lerNumero(mi[4]) });
    });
    // forma de pagamento: Pix, dinheiro, cartão (parcelas) ou boleto/a prazo (fica "a pagar")
    // (o quadro "Duplicatas / Vencimento" existe em toda DANFE: não quer dizer boleto)
    var sa = semAcento(t), mp = sa.match(/cart[a-z]*\s+de\s+credito[\s,.:-]*(\d{1,2})\s*x|credito[\s,.:-]*(\d{1,2})\s*x/);
    if (mp || /cart[a-z]*\s+(de\s+)?(credito|debito)|\(pos\)|cartao/.test(sa)) { r.forma = "cartao"; if (mp) r.parcelas = Number(mp[1] || mp[2]); }
    else if (/boleto|a prazo|faturad[ao] para/.test(sa) && !/\bpix\b/.test(sa)) { r.forma = "boleto"; r.pago = false; }
    else if (/\bpix\b/.test(sa)) r.forma = "pix";
    else if (/dinheiro|\bem especie\b|especie\s*[:-]?\s*r?\$?\s*\d/.test(sa.replace(/especie\s+volumes?/g, ""))) r.forma = "dinheiro";   // "ESPÉCIE VOLUMES" da DANFE é do transporte
    // despesa avulsa (posto, oficina, lanchonete...): categoria sugerida
    r.categoria = categoriaPeloTexto(sa);
    // nenhum formato reconhecido: qualquer linha com unidade (UN, PC, GL...) seguida de pelo menos 2 valores é um material;
    // a descrição é o que vem antes (sem o código, NCM, CST, CFOP) ou a linha de cima, se a de cima for só o nome
    // material que não faz sentido (quantidade que é o CFOP "5102", cabeçalho da tabela...) sai da lista
    var palavras = function (d) { return (String(d).match(/[A-Za-zÀ-ú]{3,}/g) || []).filter(function (w) { return /[aeiouáéíóúâêôãõ]/i.test(w); }).length; };
    var semFim = function (d) { var w = String(d).split(" "); while (w.length && /^[\dOIlS.\/-]{3,}$/.test(w[w.length - 1]) && (w[w.length - 1].match(/\d/g) || []).length >= 2) w.pop(); return w.join(" "); };
    var CAB = /total|subtotal|desconto|valor|base de c|imposto|icms|frete|quant|descri|\bcod\b|codigo|código|produto|unid/i;
    r.itens = r.itens.filter(function (x) { return x.qtd > 0 && x.qtd <= 999 && palavras(x.item) >= 1 && !CAB.test(x.item); })
      .map(function (x) { x.item = semFim(x.item); return x; });
    if (!r.itens.length) ls.forEach(function (x, i) {
      var l = String(x || "").replace(/[|\[\]“”"=_{}]/g, " ").replace(/\s+/g, " ").trim();
      var mu = l.match(/^(.*?)\b(UN|UND|UNID|PC|PÇ|PCT|M|MT|KG|CX|RL|LT|GL|LATA|BD|PAR)\b\.?\s*(.*)$/i);
      if (!mu) return;
      var ns = (mu[3].match(/\d{1,3}(?:\.\d{3})*,\d{2,6}/g) || []).map(A.lerNumero);
      if (ns.length < 2 || !(ns[0] > 0) || !(ns[1] > 0) || ns[0] > 9999) return;
      if (/\d,\d{2}\s*$/.test(mu[1])) return;   // "1,00 UN ESMALTE..." (quantidade antes da unidade) é outro formato
      var desc = semFim(mu[1].replace(/^\W*\d{2,14}\s+/, "").trim()).replace(/(\s+\d{1,4})+\s*$/, "").trim();
      if (palavras(desc) < 2 && ls[i - 1] && !/\d,\d{2}/.test(ls[i - 1])) desc = semFim(String(ls[i - 1]).replace(/[|\[\]“”"=_]/g, " ").replace(/^\W*\d{2,14}\s+/, "").replace(/\s+/g, " ").trim());
      if (palavras(desc) < 2 || CAB.test(desc)) return;
      var qtd = ns[0], unit = ns[1], tot = null;
      for (var k = 2; k < ns.length && tot === null; k++) if (Math.abs(ns[k] - qtd * unit) < 0.05) tot = ns[k];
      if (tot === null && Math.round(qtd * 100) % 100 !== 0) {   // "4 43,21 172,84": a quantidade sem vírgula ficou de fora
        var rz = unit / qtd;
        if (rz >= 1 && rz <= 999 && Math.abs(rz - Math.round(rz)) < 0.005) { tot = unit; unit = qtd; qtd = Math.round(rz); }
      }
      if (tot === null) tot = Math.round(qtd * unit * 100) / 100;
      r.itens.push({ item: desc.slice(0, 120), qtd: qtd, un: mu[2].toLowerCase().replace(/und|unid/, "un").replace("mt", "m"), unit: unit, valor: tot });
    });
    // descrição limpa: sem o código do produto no começo ("ODOUO069" = 00000069 lido torto), sem NCM/CST/CFOP e sem traços soltos
    var ehCodigo = function (w) { return w.length >= 5 && (w.match(/\d/g) || []).length >= 2 && (w.match(/[\dOoUIl]/g) || []).length / w.length >= 0.8; };
    r.itens.forEach(function (x) {
      var d = String(x.item || "").replace(/[\s\/|;:—–-]*\d{8}(?!\d).*$/, "").replace(/\s[—–*]+(?=\s|$)/g, " ").replace(/\s+/g, " ").trim();
      var w = d.split(" ");
      while (w.length > 1 && ehCodigo(w[0].replace(/\W/g, ""))) w.shift();
      d = w.join(" ").replace(/^[\s—–*;:.,|\/-]+|[\s—–*;:,|\/-]+$/g, "").trim();
      if (palavras(d) >= 1) x.item = d;
    });
    // unitário que faltou e conferência: se a soma dos materiais bate com o total, o valor está certo
    r.itens.forEach(function (x) { if (!x.unit && x.qtd > 0 && x.valor) x.unit = Math.round(x.valor / x.qtd * 100) / 100; });
    var somaIt = r.itens.reduce(function (s2, x) { return s2 + (Number(x.valor) || 0); }, 0);
    if (r.valorIncerto && r.itens.length >= 2 && !r.itens.some(function (x) { return !(Number(x.valor) > 0); }) && Math.abs(somaIt - r.valor) < 0.05) delete r.valorIncerto;   // 1 item só pode ser o próprio “maior valor”
    var semPreco = r.itens.filter(function (x) { return !(Number(x.valor) > 0); }).length;
    if (!r.valor && somaIt && !semPreco) { r.valor = Math.round(somaIt * 100) / 100; r.valorIncerto = true; }
    // total menor que os materiais não existe (a foto pegou outro número, ex.: o ICMS): fica com o valor que mais aparece
    // entre a soma dos materiais e 50% acima (impostos/frete), de preferência o da fatura; e pede para conferir
    // DANFE: o "VALOR TOTAL DOS PRODUTOS" também é piso (o total pode ter desconto, mas não é 1,70 numa nota de 52,30)
    var vProd = 0;
    ls.forEach(function (x, i) {
      if (vProd || !/total\s*dos\s*produtos/i.test(x)) return;
      var v1 = pos(valoresT(x.slice(x.search(/total\s*dos\s*produtos/i))));
      if (!v1.length && ls[i + 1]) v1 = pos(valoresT(ls[i + 1]));
      if (v1.length) vProd = v1[v1.length - 1];
    });
    if (vProd && somaIt > vProd * 1.02 + 0.05) { r.itensSuspeitos = true; somaIt = 0; }   // material lido errado: vale o total impresso
    if (vProd) r.vProd = vProd;
    var piso = Math.max(somaIt, vProd * 0.9);
    // total na mesma linha do rótulo e repetido na nota ("TOTAL 219,68" e "Crédito 2x R$ 219,68"): é ele; o material é que foi lido errado
    var repete = r.valor && valoresT(t).filter(function (v) { return Math.abs(v - r.valor) < 0.005; }).length >= 2;
    if (r.naLinha && repete && !vProd) { piso = 0; r.totalFirme = true; }
    delete r.naLinha;
    if (piso && r.valor && r.valor < piso - 0.05) {
      var base = Math.max(somaIt, vProd), cont = {}, mx = base * 1.5 + 0.05;
      valoresT(t).forEach(function (v) { if (v >= piso - 0.05 && v <= mx) cont[v] = (cont[v] || 0) + 1; });
      var reF = /(?:fatura|parcela|vencimento|duplicata)[^\n]*?valor[^\d\n]{0,12}(\d{1,3}(?:\.\d{3})*,\d{2})(?![\d\/])/gi, mf2;
      while ((mf2 = reF.exec(t))) { var vf = A.lerNumero(mf2[1]); if (vf >= piso - 0.05 && vf <= mx) cont[vf] = (cont[vf] || 0) + 10; }
      var melhorV = Object.keys(cont).map(Number).sort(function (a2, b2) { return cont[b2] - cont[a2] || a2 - b2; })[0];
      r.valor = melhorV || Math.round(base * 100) / 100; r.valorIncerto = true;
    }
    // chave de acesso da NF-e/NFC-e (44 números, pode vir quebrada em grupos ou linhas): só vale se o dígito verificador conferir
    var junto = t.replace(/(\d)[ \t]*\n[ \t]*(\d)/g, "$1 $2"), mc2, reC = /\d[\d .]{42,80}\d/g;
    while (!r.chave && (mc2 = reC.exec(junto))) {
      var dd = mc2[0].replace(/\D/g, "");
      for (var k = 0; k + 44 <= dd.length && !r.chave; k++) if (chaveValida(dd.substr(k, 44)) && cnpjOk(dd.substr(k + 6, 14))) r.chave = dd.substr(k, 44);
    }
    // um número da chave saiu errado na foto (8 lido como 0...): tenta trocar um dígito de cada vez; só vale se a chave
    // corrigida conferir E trouxer o CNPJ de uma loja que você já usa (assim não inventa chave)
    if (!r.chave && (CTX.cnpjs || []).length) {
      var conhecidos = {};
      CTX.cnpjs.forEach(function (x) { var c0 = String(x || "").replace(/\D/g, ""); if (c0.length === 14) conhecidos[c0] = 1; });
      var achadas = {}, reC2 = /\d[\d .]{42,80}\d/g, mc3;
      while ((mc3 = reC2.exec(junto))) {
        var d3 = mc3[0].replace(/\D/g, "");
        for (var k3 = 0; k3 + 44 <= d3.length; k3++) {
          var base3 = d3.substr(k3, 44);
          if (!/^(1[1-7]|2[1-9]|3[1-35]|4[1-3]|5[0-3])/.test(base3)) continue;   // começa pelo código do estado
          for (var p3 = 0; p3 < 44; p3++) for (var g3 = 0; g3 <= 9; g3++) {
            if (String(g3) === base3[p3]) continue;
            var c3 = base3.slice(0, p3) + g3 + base3.slice(p3 + 1);
            if (conhecidos[c3.substr(6, 14)] && chaveValida(c3)) achadas[c3] = 1;
          }
        }
      }
      var lista3 = Object.keys(achadas);
      // várias trocas possíveis: fica a que bate com o número da nota e o mês/ano da data lidos na foto
      if (lista3.length > 1) {
        var mnum = t.match(/\bN(?:[ºo°]|\.|[uú]mero:?)\s*([\d.]{3,15})/i), num3 = mnum ? Number(mnum[1].replace(/\D/g, "")) : null;
        var aamm = r.data ? r.data.slice(2, 4) + r.data.slice(5, 7) : null;
        lista3 = lista3.filter(function (c3) { return (!num3 || Number(c3.substr(25, 9)) === num3) && (!aamm || c3.substr(2, 4) === aamm); });
      }
      if (lista3.length === 1) { r.chave = lista3[0]; r.chaveCorrigida = true; }
      // a chave tem mais de um número errado: não grava a chave, mas o CNPJ dentro dela a 1 número de uma loja conhecida identifica a loja
      if (!r.chave) {
        var reC4 = /\d[\d .]{42,80}\d/g, mc4, perto = null;
        while (!perto && (mc4 = reC4.exec(junto))) {
          var d4c = mc4[0].replace(/\D/g, "");
          for (var k5 = 0; k5 + 44 <= d4c.length && !perto; k5++) {
            var ch5 = d4c.substr(k5, 44);
            if (!/^(1[1-7]|2[1-9]|3[1-35]|4[1-3]|5[0-3])/.test(ch5) || !/^(55|65)$/.test(ch5.substr(20, 2))) continue;
            var cj5 = ch5.substr(6, 14);
            Object.keys(conhecidos).forEach(function (kc) {
              if (perto) return;
              var dif = 0; for (var z = 0; z < 14; z++) if (kc[z] !== cj5[z]) dif++;
              if (dif <= 1) perto = { cnpj: kc, numero: String(Number(ch5.substr(25, 9))) };
            });
          }
        }
        if (perto && !(r.cnpj && cnpjOk(r.cnpj))) r.cnpj = perto.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
        if (perto) r.numeroDaChave = perto.numero;
      }
    }
    if (r.chave) {
      // a chave traz o CNPJ da loja e o número da nota (mais confiáveis que a leitura do resto da foto)
      var cj = r.chave.substr(6, 14);
      r.cnpj = cj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
      r.numero = String(Number(r.chave.substr(25, 9)));
    } else {
      var mn = t.match(/\bN(?:[ºo°]|\.|[uú]mero:?)\s*([\d.]{3,15})/i);
      if (mn) r.numero = String(Number(mn[1].replace(/\D/g, "")));
      else if (r.numeroDaChave) r.numero = r.numeroDaChave;
    }
    delete r.numeroDaChave;
    return r;
  }
  // lista colada (tabela da conversa, WhatsApp, planilha): "10 | Fita crepe larga | 13,50 | 135,00", "10 Fita crepe 13,50 135,00",
  // "2 un Selador Eucatex 18L 99,00" — e a data e o total, se vierem junto ("18/09/2026, total R$ 685,80")
  function lerLista(texto) {
    var r = { itens: [] }, din = /\d{1,3}(?:\.\d{3})*,\d{2}(?!\d)|\d+\.\d{2}(?![\d,])/g;
    var num = function (v) { return /,/.test(v) ? A.lerNumero(v) : Number(v); };
    String(texto || "").split(/\r?\n/).forEach(function (l0) {
      var l = l0.replace(/\*\*|__|`/g, "").replace(/R\$\s*/gi, "").trim();
      if (!l || /^[|:\-\s]+$/.test(l)) return;
      var md = l.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
      if (md && !r.data) { var ano = md[3].length === 2 ? "20" + md[3] : md[3]; r.data = ano + "-" + ("0" + md[2]).slice(-2) + "-" + ("0" + md[1]).slice(-2); }
      var mt = l.match(/total[^\d]{0,20}(\d{1,3}(?:\.\d{3})*,\d{2})/i);
      if (mt && l.indexOf("|") < 0 && (md || !/^\W*\d/.test(l))) { r.valor = A.lerNumero(mt[1]); return; }
      var cel = l.indexOf("|") >= 0 ? l.split("|").map(function (x) { return x.trim(); }).filter(Boolean) : l.indexOf("\t") >= 0 ? l.split("\t").map(function (x) { return x.trim(); }).filter(Boolean) : null;
      var qtd, desc, vals, un = "un";
      if (cel && cel.length >= 3) {
        if (/^(qtd|quant|qde|material|descri)/i.test(cel[0])) return;   // cabeçalho
        if (!/^\d+(?:[.,]\d+)?$/.test(cel[0])) return;
        qtd = num(cel[0]); desc = cel.filter(function (x, i) { return i > 0 && /[A-Za-zÀ-ú]{2,}/.test(x); })[0] || "";
        vals = cel.slice(1).filter(function (x) { return /^\d{1,3}(?:\.\d{3})*,\d{2}$|^\d+\.\d{2}$/.test(x); }).map(num);
      } else {
        var m = l.match(/^\W*(\d+(?:[.,]\d{1,3})?)\s*(?:x\s+)?(un|und|pç|pc|m|kg|l|cx|rolo|rolos|galão|galao|gl|lata|lt|balde|par)?\.?\s+(.+)$/i);
        if (!m) return;
        qtd = num(m[1]); if (m[2]) un = m[2].toLowerCase().replace(/^und$|^pc$/, "un").replace(/^galao$|^gl$/, "galão").replace(/^rolos$/, "rolo").replace(/^lt$/, "lata");
        var resto = m[3]; vals = (resto.match(din) || []).map(num);
        desc = resto.replace(din, " ").replace(/[|–—=:]+/g, " ").replace(/\s+/g, " ").trim();
      }
      desc = String(desc || "").replace(/\s+/g, " ").trim();
      if (!(qtd > 0) || qtd > 9999 || !/[A-Za-zÀ-ú]{2,}/.test(desc)) return;
      var unit = vals.length ? vals[0] : null, tot = vals.length > 1 ? vals[vals.length - 1] : null;
      if (unit && !tot) tot = Math.round(qtd * unit * 100) / 100;
      if (tot && !unit) unit = Math.round(tot / qtd * 100) / 100;
      r.itens.push({ item: desc.slice(0, 120), qtd: qtd, un: un, unit: unit, valor: tot });
    });
    return r;
  }
  function cnpjOk(c) {
    c = String(c || "").replace(/\D/g, "");
    if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
    var dv = function (n) { var s = 0, p = n - 7; for (var i = 0; i < n; i++) { s += Number(c[i]) * p--; if (p < 2) p = 9; } var r = s % 11; return r < 2 ? 0 : 11 - r; };
    return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
  }
  function chaveValida(c) {
    if (!/^\d{44}$/.test(c) || !/^(55|65)$/.test(c.substr(20, 2))) return false;   // modelo 55 (NF-e) ou 65 (NFC-e)
    var soma = 0, peso = 2;
    for (var i = 42; i >= 0; i--) { soma += Number(c[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
    var resto = soma % 11, dv = resto < 2 ? 0 : 11 - resto;
    return dv === Number(c[43]);
  }
  function categoriaPeloTexto(sa) {
    if (/gasolina|etanol|diesel|combustiv|\bposto\b|ipiranga|petrobras|shell|ale combust/.test(sa)) return "combustivel";
    if (/oficina|pneu|oleo lubrif|troca de oleo|mecanic|auto ?pecas|borracharia|alinhamento|balanceamento/.test(sa)) return "veiculo";
    if (/lanche|lanchonete|restaurante|padaria|refeic|marmit|pizzaria|churrasc/.test(sa)) return "alimentacao";
    if (/pedagio|estacionamento/.test(sa)) return "pedagio";
    return "";
  }
  function somaItens(d) { return (d.itens || []).reduce(function (t, x) { return t + (Number(x.valor) || 0); }, 0); }
  function incompletos(d) { return (d.itens || []).filter(function (x) { return !(Number(x.valor) > 0); }).length; }   // materiais sem preço
  function fecha(d) { return !!(d && d.itens && d.itens.length && !incompletos(d) && d.valor && (!d.valorIncerto || d.itens.length >= 2) && Math.abs(somaItens(d) - d.valor) < 0.05); }
  // total lido da foto menor que a soma dos materiais (ou igual a um item só): fica com a soma e pede conferência
  function corrigeTotal(d) {
    var soma = Math.round(somaItens(d) * 100) / 100;
    if (!soma || (d.itens || []).length < 2 || d.totalFirme || incompletos(d)) return;   // soma sem todos os preços não é o total
    if (d.vProd && d.valor && Math.abs(d.valor - d.vProd) < 0.05 && d.valor >= soma - 0.05) return;   // bate com o "TOTAL DOS PRODUTOS" impresso: faltou ler material
    var umItem = d.itens.some(function (x) { return Math.abs((Number(x.valor) || 0) - d.valor) < 0.05; });
    if (!d.valor || d.valorIncerto || umItem || d.valor < soma * 0.95) { d.valor = soma; d.valorIncerto = true; d.valorSoma = true; }
  }
  // PDF digital: a tabela lida pela posição vale mais quando acha mais materiais ou quando a leitura do texto não fecha
  function comTabela(d, t) {
    if (!t || !t.itens || !t.itens.length) return d;
    var n = (d.itens || []).length;
    if (n && fecha(d) && n >= t.itens.length) return d;
    if (t.itens.length < n) return d;
    d.itens = t.itens;
    if (t.total) { d.valor = t.total; delete d.valorIncerto; d.totalFirme = true; }
    else if (!d.valor || d.valorIncerto) { d.valor = Math.round(somaItens(d) * 100) / 100; d.valorIncerto = true; }
    return d;
  }
  function lerUmaNota(f, status) {
    return textoDoArquivo(f).then(function (r) {
      var d = r.xml ? lerXml(r.texto) : null;
      if (d) return { dados: d, imagem: null, bruto: "" };
      d = lerNota(r.texto);
      d = comTabela(d, r.tabela);
      if (!/^image\//.test(f.type) || fecha(d)) { if (!fecha(d)) corrigeTotal(d); return { dados: d, imagem: r.imagem || f, bruto: r.texto }; }
      // a soma dos materiais não fecha com o total: lê a tabela de novo de outros jeitos e fica com a leitura que fecha
      var melhor = d, bruto = r.texto, tentativas = [{ psm: "6", endireitar: true }, { psm: "6", cinza: true }, { psm: "4" }, { psm: "3" }];
      return tentativas.reduce(function (pr, op, n) {
        return pr.then(function () {
          if (fecha(melhor)) return;
          if (status) status("🔎 Conferindo os materiais (" + (n + 2) + "ª leitura)...");
          return textoDoArquivo(f, Object.assign({ giro: r.giro }, op)).then(function (r2) {
            var d2 = lerNota(r2.texto);
            if (fecha(Object.assign({}, d2, { valor: d.valor || d2.valor })) || d2.itens.length > melhor.itens.length) {
              melhor = Object.assign({}, d2, d, { itens: d2.itens });
              ["data", "fornecedor", "cnpj", "chave", "numero", "forma", "parcelas"].forEach(function (k) { if (!melhor[k] && d2[k]) melhor[k] = d2[k]; });
              if (!melhor.valor) melhor.valor = d2.valor;
              bruto = r.texto + "\n\n----- 2ª leitura -----\n" + r2.texto;
            }
            // total incerto na leitura escolhida, mas achado com rótulo nesta: fica com o desta
            if ((melhor.valorIncerto || !melhor.valor) && d2.valor && !d2.valorIncerto && d2.valor >= Math.max(somaItens(melhor), somaItens(d2)) - 0.05) { melhor = Object.assign({}, melhor, { valor: d2.valor }); delete melhor.valorIncerto; delete melhor.valorSoma; }
          }).catch(function () { /* fica com a 1ª leitura */ });
        });
      }, Promise.resolve()).then(function () {
        if (fecha(melhor)) delete melhor.valorIncerto;
        else corrigeTotal(melhor);
        return { dados: melhor, imagem: r.imagem || f, bruto: bruto };
      });
    });
  }
  // XML da NF-e/NFC-e (vem no e-mail da loja): tudo exato, sem leitura de foto
  function lerXml(txt) {
    var doc;
    try { doc = new DOMParser().parseFromString(txt, "application/xml"); } catch (e) { return null; }
    var inf = doc.getElementsByTagName("infNFe")[0];
    if (!inf) return null;
    var g = function (el, tag) { var x = el && el.getElementsByTagName(tag)[0]; return x ? x.textContent.trim() : ""; };
    var emit = inf.getElementsByTagName("emit")[0], tot = inf.getElementsByTagName("ICMSTot")[0] || inf, cj = g(emit, "CNPJ");
    var tPag = g(inf.getElementsByTagName("pag")[0], "tPag");
    var r = { fornecedor: g(emit, "xFant") || g(emit, "xNome"), cnpj: cj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5"),
      data: (g(inf, "dhEmi") || g(inf, "dEmi")).slice(0, 10), valor: Number(g(tot, "vNF")) || null, chave: (inf.getAttribute("Id") || "").replace(/\D/g, "") || null,
      numero: String(Number(g(inf.getElementsByTagName("ide")[0], "nNF"))), forma: { "01": "dinheiro", "03": "cartao", "04": "cartao", "15": "boleto", "17": "pix" }[tPag] || "",
      itens: Array.prototype.map.call(inf.getElementsByTagName("det"), function (dt) {
        return { item: g(dt, "xProd"), qtd: Number(g(dt, "qCom")) || null, un: (g(dt, "uCom") || "un").toLowerCase(), unit: Math.round(Number(g(dt, "vUnCom")) * 100) / 100 || null, valor: Number(g(dt, "vProd")) || null };
      }) };
    var en = emit && emit.getElementsByTagName("enderEmit")[0];
    if (en) r.loja = { razao_social: g(emit, "xNome"), endereco: [g(en, "xLgr"), g(en, "nro")].filter(Boolean).join(", ") + (g(en, "xCpl") ? " - " + g(en, "xCpl") : ""),
      bairro: g(en, "xBairro"), cidade: g(en, "xMun"), uf: g(en, "UF"), cep: g(en, "CEP").replace(/^(\d{5})(\d{3})$/, "$1-$2"), telefone: g(en, "fone"), email: g(emit, "email") };
    if (r.forma === "boleto") r.pago = false;
    var cartao = inf.getElementsByTagName("dup").length;
    if (r.forma === "cartao" && cartao > 1) r.parcelas = cartao;
    r.categoria = categoriaPeloTexto(semAcento(r.fornecedor + " " + r.itens.map(function (x) { return x.item; }).join(" ")));
    return r;
  }

  window.AG_LEITOR = { contexto: contexto, lerNota: lerNota, lerLista: lerLista, lerXml: lerXml, lerUmaNota: lerUmaNota, cnpjOk: cnpjOk, chaveValida: chaveValida,
    fmtCnpj: fmtCnpj, categoriaPeloTexto: categoriaPeloTexto, somaItens: somaItens, fecha: fecha, lerPix: lerPix, acharPessoa: acharPessoa, textoDoArquivo: textoDoArquivo, ocr: ocr, lerPdf: lerPdf, semAcento: semAcento,
    progresso: function (fn) { progresso = fn; } };
})();
