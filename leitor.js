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
          // a primeira página vira imagem para guardar como comprovante
          var vp = pg.getViewport({ scale: 1.6 }), cv = document.createElement("canvas");
          cv.width = vp.width; cv.height = vp.height;
          return pg.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise.then(function () {
            return new Promise(function (ok) { cv.toBlob(function (b) { ok({ texto: linhas.join("\n"), imagem: b }); }, "image/jpeg", 0.85); });
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

  window.AG_LEITOR = { lerPix: lerPix, acharPessoa: acharPessoa, textoDoArquivo: textoDoArquivo, ocr: ocr, lerPdf: lerPdf, semAcento: semAcento,
    progresso: function (fn) { progresso = fn; } };
})();
