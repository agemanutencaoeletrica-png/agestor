// =====================================================================
// CONFIGURAÇÃO DO AGESTOR — preencha uma vez (veja o LEIA-ME.md).
// A chave "publishable/anon" do Supabase pode ficar aqui: ela é pública por
// natureza. Quem protege os dados são as regras do supabase/schema.sql.
// NUNCA coloque aqui a chave "service_role" nem tokens de pagamento.
// =====================================================================
window.AGESTOR_CONFIG = {
  SUPABASE_URL: "",       // ex.: https://xxxx.supabase.co
  SUPABASE_ANON_KEY: "",  // chave pública (anon / publishable)

  SUPORTE_WHATSAPP: "(31) 98858-9772",
  DIAS_TESTE: 14,

  // planos mostrados no site (a cobrança automática entra depois)
  PLANOS: [
    { nome: "Básico", preco: 79, usuarios: "até 3 pessoas", itens: ["Clientes, orçamentos e catálogo", "Orçamento em PDF e WhatsApp", "Sua marca e suas cores"] },
    { nome: "Profissional", preco: 149, usuarios: "até 10 pessoas", destaque: true, itens: ["Tudo do Básico", "Equipe com permissões", "Suporte prioritário"] },
    { nome: "Empresa", preco: 249, usuarios: "pessoas ilimitadas", itens: ["Tudo do Profissional", "Ajuda para configurar", "Módulos novos primeiro"] }
  ]
};
