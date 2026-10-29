// Padrões do AGEstor: o que cada empresa recebe ao começar e pode mudar depois
// em "Empresa" (nada aqui precisa ser editado para personalizar um cliente).
(function () {
  "use strict";

  // nomes na tela (a empresa troca em Empresa > Nomes na tela)
  var ROTULOS = {
    cliente: "Cliente", clientes: "Clientes",
    orcamento: "Orçamento", orcamentos: "Orçamentos",
    servico: "Serviço", servicos: "Serviços", material: "Material", materiais: "Materiais", catalogo: "Catálogo",
    ordem: "Ordem de serviço", ordens: "Ordens de serviço"
  };

  // áreas que podem ser ligadas e desligadas
  var MODULOS = [
    { id: "clientes", nome: "Clientes", desc: "Cadastro de clientes com telefone, endereço e WhatsApp." },
    { id: "orcamentos", nome: "Orçamentos", desc: "Orçamentos com itens, total automático, PDF e envio pelo WhatsApp." },
    { id: "catalogo", nome: "Catálogo", desc: "Sua tabela de serviços e materiais com preço, usada nos orçamentos." },
    { id: "servicos", nome: "Ordens de serviço", desc: "Serviços para a equipe, com chegada e saída pelo GPS, fotos, relatório e assinatura do cliente." },
    { id: "pagamentos", nome: "Pagamentos da equipe", desc: "Lê o comprovante Pix, guarda e faz o fechamento por semana, quinzena ou mês." },
    { id: "compras", nome: "Compras e despesas", desc: "Lê a nota fiscal (foto, PDF ou XML), controla o que falta pagar e guarda o custo dos materiais." },
    { id: "equipe", nome: "Equipe", desc: "Convide funcionários e escolha o que cada um pode fazer." }
  ];

  var CONFIG = {
    modulos: { clientes: true, orcamentos: true, catalogo: true, servicos: true, pagamentos: true, compras: true, equipe: true },
    rotulos: {},
    orcamento: {
      validade_dias: 15,
      garantia_dias: 90,
      pagamento: "50% na aprovação e 50% na entrega do serviço.",
      rodape: "",
      ocultar_valor_material: false
    }
  };

  // tabela inicial por ramo: [tipo, descrição, unidade, valor]
  var S = "servico", M = "material";
  var RAMOS = {
    eletrica: { nome: "Elétrica", itens: [
      [S, "Instalação de tomada ou interruptor", "un", 45], [S, "Troca de disjuntor", "un", 60],
      [S, "Instalação de chuveiro", "un", 90], [S, "Instalação de luminária / plafon", "un", 50],
      [S, "Montagem de quadro de distribuição", "un", 450], [S, "Visita técnica e diagnóstico", "un", 80],
      [S, "Passagem de cabo (por ponto)", "pt", 70], [M, "Cabo flexível 2,5 mm²", "m", 3.2],
      [M, "Cabo flexível 4 mm²", "m", 5.1], [M, "Disjuntor DIN 20 A", "un", 18],
      [M, "Tomada 2P+T 10 A", "un", 14], [M, "Eletroduto corrugado 3/4\"", "m", 2.4]
    ] },
    pintura: { nome: "Pintura", itens: [
      [S, "Pintura de parede interna (2 demãos)", "m²", 18], [S, "Pintura de parede externa (2 demãos)", "m²", 24],
      [S, "Aplicação de massa corrida", "m²", 15], [S, "Lixamento e preparação", "m²", 6],
      [S, "Pintura de porta", "un", 120], [S, "Pintura de grade / portão", "m²", 35],
      [S, "Textura / grafiato", "m²", 28], [M, "Tinta acrílica 18 L", "lata", 380],
      [M, "Massa corrida 25 kg", "bd", 95], [M, "Selador acrílico 18 L", "lata", 160],
      [M, "Lixa d'água", "un", 2.5], [M, "Fita crepe 48 mm", "rolo", 14]
    ] },
    hidraulica: { nome: "Hidráulica", itens: [
      [S, "Desentupimento de pia / ralo", "un", 120], [S, "Troca de torneira", "un", 60],
      [S, "Troca de registro", "un", 150], [S, "Instalação de vaso sanitário", "un", 180],
      [S, "Caça-vazamento", "un", 250], [S, "Instalação de caixa d'água", "un", 350],
      [M, "Tubo PVC soldável 25 mm (6 m)", "br", 32], [M, "Registro de gaveta 3/4\"", "un", 55],
      [M, "Joelho PVC 25 mm", "un", 1.8], [M, "Veda-rosca", "rolo", 6]
    ] },
    refrigeracao: { nome: "Refrigeração / ar-condicionado", itens: [
      [S, "Instalação de split até 12.000 BTU", "un", 650], [S, "Instalação de split 18.000 a 24.000 BTU", "un", 850],
      [S, "Limpeza / higienização de split", "un", 180], [S, "Carga de gás", "un", 300],
      [S, "Visita técnica e diagnóstico", "un", 100], [M, "Tubulação de cobre (par) 1/4 x 3/8", "m", 75],
      [M, "Suporte para condensadora", "par", 70], [M, "Cabo PP 3 x 2,5 mm²", "m", 9]
    ] },
    manutencao: { nome: "Manutenção predial", itens: [
      [S, "Hora técnica", "h", 90], [S, "Visita técnica", "un", 80],
      [S, "Pequenos reparos (diária)", "dia", 350], [S, "Instalação de suporte / prateleira", "un", 60],
      [S, "Troca de fechadura", "un", 90], [S, "Rejunte e reparo de piso", "m²", 30],
      [M, "Parafuso e bucha (kit)", "kit", 12], [M, "Silicone", "tb", 22]
    ] },
    outro: { nome: "Outro ramo", itens: [
      [S, "Visita técnica", "un", 80], [S, "Mão de obra (diária)", "dia", 300], [S, "Hora técnica", "h", 80]
    ] }
  };

  window.AG_PADRAO = { ROTULOS: ROTULOS, MODULOS: MODULOS, CONFIG: CONFIG, RAMOS: RAMOS };
})();
