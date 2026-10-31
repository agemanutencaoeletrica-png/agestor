-- =====================================================================
-- AGEstor — banco de dados (Supabase)
--
-- Como usar: no Supabase abra "SQL Editor" > "+" (nova consulta), cole
-- este arquivo inteiro e clique em "Run". Pode rodar de novo quando o app
-- for atualizado: nada é apagado.
--
-- Segurança:
--   * Várias empresas no mesmo sistema. Cada pessoa pertence a UMA empresa
--     e só enxerga os dados dela (regras RLS em todas as tabelas).
--   * Papéis: dono (tudo), admin (tudo menos mexer no dono) e equipe
--     (usa o dia a dia; não muda configuração, não apaga, não vê convites).
--   * Validade e situação da assinatura só mudam pelo dono do AGEstor
--     (tabela admins). Empresa vencida continua vendo os dados, mas não grava.
-- =====================================================================

-- ---------- Tabelas ----------

create table if not exists public.admins (
  email text primary key
);

create table if not exists public.empresas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  ramo        text,
  cnpj        text,
  whatsapp    text,
  email       text,
  cidade      text,
  endereco    text,
  site        text,
  cor1        text not null default '#0f766e',
  cor2        text not null default '#f59e0b',
  logo        text,                                   -- imagem pequena (data:image/...) já reduzida pelo app
  config      jsonb not null default '{}'::jsonb,      -- tudo que a empresa personaliza (veja o LEIA-ME)
  plano       text not null default 'teste',
  status      text not null default 'teste' check (status in ('teste', 'ativa', 'bloqueada', 'cancelada')),
  valido_ate  timestamptz not null default now() + interval '14 days',
  observacao  text,                                   -- anotação do dono do AGEstor
  criado_em   timestamptz not null default now(),
  constraint empresas_logo_tam check (logo is null or (length(logo) <= 300000 and logo like 'data:image/%')),
  constraint empresas_config_tam check (jsonb_typeof(config) = 'object' and length(config::text) <= 20000),
  constraint empresas_cores check (cor1 ~ '^#[0-9a-fA-F]{6}$' and cor2 ~ '^#[0-9a-fA-F]{6}$')
);

create table if not exists public.membros (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  usuario     uuid not null unique,                   -- auth.users.id (uma empresa por pessoa)
  email       text not null,
  nome        text,
  papel       text not null default 'equipe' check (papel in ('dono', 'admin', 'equipe')),
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

create table if not exists public.convites (
  codigo      text primary key,
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  papel       text not null default 'equipe' check (papel in ('admin', 'equipe')),
  criado_por  uuid,
  usado_por   uuid,
  usado_em    timestamptz,
  expira_em   timestamptz not null default now() + interval '7 days',
  criado_em   timestamptz not null default now()
);

create table if not exists public.clientes (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas (id) on delete cascade,
  nome          text not null check (length(trim(nome)) between 1 and 160),
  telefone      text,
  email         text,
  documento     text,                                 -- CPF ou CNPJ
  endereco      text,
  cidade        text,
  obs           text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.catalogo (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  tipo        text not null default 'servico' check (tipo in ('servico', 'material')),
  descricao   text not null check (length(trim(descricao)) between 1 and 200),
  un          text not null default 'un',
  valor       numeric(12, 2) not null default 0 check (valor >= 0),
  categoria   text,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

create table if not exists public.orcamentos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas (id) on delete cascade,
  numero         integer not null default 0,           -- sequência própria de cada empresa (trigger)
  cliente_id     uuid references public.clientes (id) on delete set null,
  cliente_nome   text,                                 -- cópia do nome (o orçamento não muda se o cliente for apagado)
  titulo         text,
  itens          jsonb not null default '[]'::jsonb,   -- [{tipo, descricao, qtd, un, valor}]
  desconto       numeric(12, 2) not null default 0 check (desconto >= 0),
  total          numeric(12, 2) not null default 0,    -- calculado pelo banco
  observacoes    text,
  validade_dias  integer check (validade_dias between 1 and 365),
  status         text not null default 'rascunho' check (status in ('rascunho', 'enviado', 'aprovado', 'recusado')),
  criado_por     uuid,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  constraint orcamentos_itens check (jsonb_typeof(itens) = 'array' and jsonb_array_length(itens) <= 300)
);

create index if not exists membros_emp_idx on public.membros (empresa_id);
create index if not exists convites_emp_idx on public.convites (empresa_id);
create index if not exists clientes_emp_idx on public.clientes (empresa_id, nome);
create index if not exists catalogo_emp_idx on public.catalogo (empresa_id, tipo, descricao);
create index if not exists orcamentos_emp_idx on public.orcamentos (empresa_id, criado_em desc);
create unique index if not exists orcamentos_num_idx on public.orcamentos (empresa_id, numero);

-- ---------- Funções de apoio ----------

create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  -- pelo usuário logado (auth.uid) e pelo e-mail atual e confirmado dele em auth.users, e não só pelo e-mail do login
  select exists (select 1 from public.admins a join auth.users u on lower(u.email) = lower(a.email)
                 where u.id = auth.uid() and u.email_confirmed_at is not null);
$$;

-- empresa da pessoa logada (null se ainda não entrou em nenhuma)
create or replace function public.minha_empresa() returns uuid
language sql stable security definer set search_path = public as $$
  select m.empresa_id from public.membros m where m.usuario = auth.uid() and m.ativo;
$$;

create or replace function public.meu_papel() returns text
language sql stable security definer set search_path = public as $$
  select m.papel from public.membros m where m.usuario = auth.uid() and m.ativo;
$$;

create or replace function public.sou_gestor() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.meu_papel() in ('dono', 'admin'), false);
$$;

-- a empresa pode gravar? (teste ou ativa, dentro da validade)
create or replace function public.empresa_liberada() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.empresas e
                 where e.id = public.minha_empresa() and e.status in ('teste', 'ativa') and e.valido_ate > now());
$$;

-- ---------- Ações (funções chamadas pelo app) ----------

-- primeiro acesso: cria a empresa e faz da pessoa a dona (14 dias de teste)
create or replace function public.criar_empresa(p jsonb) returns public.empresas
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  e public.empresas;
begin
  if v_uid is null then raise exception 'Entre com seu e-mail e senha.'; end if;
  delete from public.membros where usuario = v_uid and not ativo;   -- quem foi desligado pode recomeçar
  if exists (select 1 from public.membros where usuario = v_uid) then
    raise exception 'Você já faz parte de uma empresa.';
  end if;
  if coalesce(trim(p ->> 'nome'), '') = '' then raise exception 'Informe o nome da empresa.'; end if;
  insert into public.empresas (nome, ramo, cidade, whatsapp, email)
  values (left(trim(p ->> 'nome'), 120), left(nullif(trim(p ->> 'ramo'), ''), 60), left(nullif(trim(p ->> 'cidade'), ''), 80),
          left(nullif(trim(p ->> 'whatsapp'), ''), 30), v_email)
  returning * into e;
  insert into public.membros (empresa_id, usuario, email, nome, papel)
  values (e.id, v_uid, v_email, left(nullif(trim(p ->> 'seu_nome'), ''), 80), 'dono');
  return e;
end $$;

-- dono/admin altera dados e personalização (nunca validade, situação ou plano)
create or replace function public.salvar_empresa(p jsonb) returns public.empresas
language plpgsql volatile security definer set search_path = public as $$
declare e public.empresas;
begin
  if not public.sou_gestor() then raise exception 'Só o dono ou um administrador pode mudar os dados da empresa.'; end if;
  update public.empresas set
    nome     = coalesce(nullif(left(trim(p ->> 'nome'), 120), ''), nome),
    ramo     = case when p ? 'ramo' then left(nullif(trim(p ->> 'ramo'), ''), 60) else ramo end,
    cnpj     = case when p ? 'cnpj' then left(nullif(trim(p ->> 'cnpj'), ''), 20) else cnpj end,
    whatsapp = case when p ? 'whatsapp' then left(nullif(trim(p ->> 'whatsapp'), ''), 30) else whatsapp end,
    email    = case when p ? 'email' then left(nullif(trim(p ->> 'email'), ''), 120) else email end,
    cidade   = case when p ? 'cidade' then left(nullif(trim(p ->> 'cidade'), ''), 80) else cidade end,
    endereco = case when p ? 'endereco' then left(nullif(trim(p ->> 'endereco'), ''), 200) else endereco end,
    site     = case when p ? 'site' then left(nullif(trim(p ->> 'site'), ''), 200) else site end,
    cor1     = case when coalesce(p ->> 'cor1', '') ~ '^#[0-9a-fA-F]{6}$' then p ->> 'cor1' else cor1 end,
    cor2     = case when coalesce(p ->> 'cor2', '') ~ '^#[0-9a-fA-F]{6}$' then p ->> 'cor2' else cor2 end,
    logo     = case when p ? 'logo' then nullif(p ->> 'logo', '') else logo end,
    config   = case when jsonb_typeof(p -> 'config') = 'object' then p -> 'config' else config end
  where id = public.minha_empresa()
  returning * into e;
  if not found then raise exception 'Empresa não encontrada.'; end if;
  return e;
end $$;

-- gera um código para alguém entrar na equipe (vale 7 dias, uso único)
create or replace function public.criar_convite(p_papel text default 'equipe') returns text
language plpgsql volatile security definer set search_path = public as $$
declare v_cod text; v_b bytea; k integer;
  v_letras constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';  -- sem 0/O, 1/I/L (fácil de ditar)
begin
  if not public.sou_gestor() then raise exception 'Só o dono ou um administrador pode convidar.'; end if;
  if p_papel not in ('admin', 'equipe') then raise exception 'Papel inválido.'; end if;
  if p_papel = 'admin' and public.meu_papel() <> 'dono' then raise exception 'Só o dono pode convidar administradores.'; end if;
  loop
    v_b := uuid_send(gen_random_uuid()); v_cod := '';
    for k in 0..7 loop v_cod := v_cod || substr(v_letras, get_byte(v_b, k) % 31 + 1, 1); end loop;
    exit when not exists (select 1 from public.convites where codigo = v_cod);
  end loop;
  insert into public.convites (codigo, empresa_id, papel, criado_por) values (v_cod, public.minha_empresa(), p_papel, auth.uid());
  return v_cod;
end $$;

create or replace function public.entrar_com_convite(p_codigo text, p_nome text default null) returns public.empresas
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  c public.convites;
  e public.empresas;
begin
  if v_uid is null then raise exception 'Entre com seu e-mail e senha.'; end if;
  delete from public.membros where usuario = v_uid and not ativo;   -- quem foi desligado pode entrar em outra
  if exists (select 1 from public.membros where usuario = v_uid) then raise exception 'Você já faz parte de uma empresa.'; end if;
  select * into c from public.convites where codigo = upper(trim(coalesce(p_codigo, ''))) for update;
  if not found or c.usado_por is not null or c.expira_em < now() then
    raise exception 'Código de convite inválido ou vencido. Peça um novo.';
  end if;
  update public.convites set usado_por = v_uid, usado_em = now() where codigo = c.codigo;
  insert into public.membros (empresa_id, usuario, email, nome, papel)
  values (c.empresa_id, v_uid, lower(coalesce(auth.jwt() ->> 'email', '')), left(nullif(trim(p_nome), ''), 80), c.papel);
  select * into e from public.empresas where id = c.empresa_id;
  return e;
end $$;

-- dono/admin muda papel, ativa ou desativa alguém (o dono não pode ser mexido)
create or replace function public.ajustar_membro(p_id uuid, p_papel text, p_ativo boolean) returns public.membros
language plpgsql volatile security definer set search_path = public as $$
declare m public.membros;
begin
  if not public.sou_gestor() then raise exception 'Só o dono ou um administrador pode mudar a equipe.'; end if;
  select * into m from public.membros where id = p_id and empresa_id = public.minha_empresa() for update;
  if not found then raise exception 'Pessoa não encontrada.'; end if;
  if m.papel = 'dono' then raise exception 'O dono da empresa não pode ser alterado aqui.'; end if;
  if m.usuario = auth.uid() then raise exception 'Você não pode mudar o seu próprio acesso.'; end if;
  if p_papel not in ('admin', 'equipe') then raise exception 'Papel inválido.'; end if;
  if (p_papel = 'admin' or m.papel = 'admin') and public.meu_papel() <> 'dono' then
    raise exception 'Só o dono pode mudar administradores.';
  end if;
  update public.membros set papel = p_papel, ativo = coalesce(p_ativo, ativo) where id = m.id returning * into m;
  if not m.ativo then delete from public.convites where criado_por = m.usuario and usado_por is null and empresa_id = m.empresa_id; end if;   -- quem saiu não deixa convite aberto
  return m;
end $$;

-- a pessoa muda o próprio nome
create or replace function public.salvar_meu_nome(p_nome text) returns void
language sql volatile security definer set search_path = public as $$
  update public.membros set nome = left(nullif(trim(p_nome), ''), 80) where usuario = auth.uid();
$$;

-- painel do dono do AGEstor: libera, estende ou bloqueia uma empresa
create or replace function public.admin_ajustar_empresa(p_id uuid, p_status text, p_dias integer default 0,
                                                       p_plano text default null, p_obs text default null)
returns public.empresas
language plpgsql volatile security definer set search_path = public as $$
declare e public.empresas;
begin
  if not public.eh_admin() then raise exception 'Acesso negado.'; end if;
  if p_status not in ('teste', 'ativa', 'bloqueada', 'cancelada') then raise exception 'Situação inválida.'; end if;
  update public.empresas set
    status = p_status,
    valido_ate = case when coalesce(p_dias, 0) > 0 then greatest(valido_ate, now()) + make_interval(days => p_dias) else valido_ate end,
    plano = coalesce(nullif(trim(p_plano), ''), plano),
    observacao = coalesce(p_obs, observacao)
  where id = p_id returning * into e;
  if not found then raise exception 'Empresa não encontrada.'; end if;
  return e;
end $$;

-- ---------- Gatilhos ----------

-- grava sempre na empresa da pessoa e não deixa trocar de empresa depois
create or replace function public.tg_da_empresa() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.empresa_id := public.minha_empresa();
    if new.empresa_id is null then raise exception 'Você não faz parte de nenhuma empresa.'; end if;
  else
    new.empresa_id := old.empresa_id;
    new.criado_em := old.criado_em;
  end if;
  return new;
end $$;

create or replace function public.tg_cliente() returns trigger
language plpgsql as $$
begin
  new.nome := left(trim(new.nome), 160);
  new.atualizado_em := now();
  return new;
end $$;

-- número sequencial por empresa, total calculado e itens limpos
create or replace function public.tg_orcamento() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_itens jsonb := '[]'::jsonb; v_total numeric := 0; i jsonb; q numeric; v numeric;
begin
  if new.cliente_id is not null and not exists (select 1 from public.clientes c where c.id = new.cliente_id and c.empresa_id = new.empresa_id) then
    raise exception 'Cliente não encontrado na empresa.';
  end if;
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext('orc:' || new.empresa_id::text));
    select coalesce(max(numero), 0) + 1 into new.numero from public.orcamentos where empresa_id = new.empresa_id;
    new.criado_por := auth.uid();
  else
    new.numero := old.numero;
    new.criado_por := old.criado_por;
  end if;
  if jsonb_typeof(new.itens) <> 'array' then new.itens := '[]'::jsonb; end if;
  for i in select * from jsonb_array_elements(new.itens) loop
    if jsonb_typeof(i) <> 'object' or coalesce(trim(i ->> 'descricao'), '') = '' then continue; end if;
    q := case when coalesce(i ->> 'qtd', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then greatest((i ->> 'qtd')::numeric, 0) else 1 end;
    v := case when coalesce(i ->> 'valor', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then greatest((i ->> 'valor')::numeric, 0) else 0 end;
    v_itens := v_itens || jsonb_build_object(
      'tipo', case when i ->> 'tipo' = 'material' then 'material' else 'servico' end,
      'descricao', left(trim(i ->> 'descricao'), 300),
      'qtd', q, 'un', left(coalesce(nullif(trim(i ->> 'un'), ''), 'un'), 10), 'valor', round(v, 2));
    v_total := v_total + round(q * v, 2);
  end loop;
  new.itens := v_itens;
  new.total := greatest(round(v_total - coalesce(new.desconto, 0), 2), 0);
  new.atualizado_em := now();
  return new;
end $$;

drop trigger if exists a_empresa on public.clientes;
create trigger a_empresa before insert or update on public.clientes for each row execute function public.tg_da_empresa();
drop trigger if exists b_cliente on public.clientes;
create trigger b_cliente before insert or update on public.clientes for each row execute function public.tg_cliente();
drop trigger if exists a_empresa on public.catalogo;
create trigger a_empresa before insert or update on public.catalogo for each row execute function public.tg_da_empresa();
drop trigger if exists a_empresa on public.orcamentos;
create trigger a_empresa before insert or update on public.orcamentos for each row execute function public.tg_da_empresa();
drop trigger if exists b_orcamento on public.orcamentos;
create trigger b_orcamento before insert or update on public.orcamentos for each row execute function public.tg_orcamento();

-- ---------- Regras de acesso (RLS) ----------

alter table public.admins enable row level security;
alter table public.empresas enable row level security;
alter table public.membros enable row level security;
alter table public.convites enable row level security;
alter table public.clientes enable row level security;
alter table public.catalogo enable row level security;
alter table public.orcamentos enable row level security;

drop policy if exists ver on public.empresas;
create policy ver on public.empresas for select to authenticated using (id = public.minha_empresa() or public.eh_admin());

drop policy if exists ver on public.membros;
create policy ver on public.membros for select to authenticated using (empresa_id = public.minha_empresa() or public.eh_admin());

drop policy if exists ver on public.convites;
create policy ver on public.convites for select to authenticated using (empresa_id = public.minha_empresa() and public.sou_gestor());
drop policy if exists apagar on public.convites;
create policy apagar on public.convites for delete to authenticated using (empresa_id = public.minha_empresa() and public.sou_gestor());

do $$
declare t text;
begin
  foreach t in array array['clientes', 'catalogo', 'orcamentos'] loop
    execute format('drop policy if exists ver on public.%I', t);
    execute format('create policy ver on public.%I for select to authenticated using (empresa_id = public.minha_empresa())', t);
    execute format('drop policy if exists criar on public.%I', t);
    execute format('create policy criar on public.%I for insert to authenticated with check (empresa_id = public.minha_empresa() and public.empresa_liberada())', t);
    execute format('drop policy if exists mudar on public.%I', t);
    execute format('create policy mudar on public.%I for update to authenticated using (empresa_id = public.minha_empresa() and public.empresa_liberada()) with check (empresa_id = public.minha_empresa())', t);
    execute format('drop policy if exists apagar on public.%I', t);
    execute format('create policy apagar on public.%I for delete to authenticated using (empresa_id = public.minha_empresa() and public.empresa_liberada() and public.sou_gestor())', t);
  end loop;
end $$;

-- ninguém de fora (anon) lê nada; empresas, membros e convites só mudam pelas funções acima
revoke all on public.admins, public.empresas, public.membros, public.convites, public.clientes, public.catalogo, public.orcamentos from anon;
revoke insert, update, delete on public.admins, public.empresas, public.membros from authenticated;
revoke insert, update on public.convites from authenticated;
grant select on public.empresas, public.membros, public.convites to authenticated;
grant delete on public.convites to authenticated;
grant select, insert, update, delete on public.clientes, public.catalogo, public.orcamentos to authenticated;

revoke execute on function public.criar_empresa(jsonb), public.salvar_empresa(jsonb), public.criar_convite(text),
  public.entrar_com_convite(text, text), public.ajustar_membro(uuid, text, boolean), public.salvar_meu_nome(text),
  public.admin_ajustar_empresa(uuid, text, integer, text, text) from public, anon;
grant execute on function public.criar_empresa(jsonb), public.salvar_empresa(jsonb), public.criar_convite(text),
  public.entrar_com_convite(text, text), public.ajustar_membro(uuid, text, boolean), public.salvar_meu_nome(text),
  public.admin_ajustar_empresa(uuid, text, integer, text, text), public.eh_admin(), public.minha_empresa(),
  public.meu_papel(), public.empresa_liberada() to authenticated;

-- ---------- Dono do AGEstor ----------
-- Para ver o "Painel do dono", rode UMA vez no SQL Editor, com o seu e-mail de login:
--   insert into public.admins (email) values ('seu-email@exemplo.com') on conflict do nothing;

-- =====================================================================
-- 🛠️ ORDENS DE SERVIÇO + APP DO FUNCIONÁRIO
-- Quem é da equipe só vê as ordens dele (ou que ele abriu). Chegada, fotos
-- e saída ficam com a hora do servidor e o GPS do celular; as fotos e a
-- assinatura do cliente vão para o Storage (bucket "fotos", pasta da empresa).
-- =====================================================================

create table if not exists public.servicos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas (id) on delete cascade,
  numero         integer not null default 0,
  cliente_id     uuid references public.clientes (id) on delete set null,
  cliente_nome   text,
  telefone       text,
  endereco       text,
  maps_url       text,
  titulo         text not null check (length(trim(titulo)) between 1 and 200),
  descricao      text,
  status         text not null default 'aberta' check (status in ('aberta', 'agendada', 'andamento', 'concluida', 'cancelada')),
  data_prevista  date,
  responsavel    uuid,                                -- auth.users.id de quem vai fazer
  orcamento_id   uuid references public.orcamentos (id) on delete set null,
  criado_por     uuid,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  concluida_em   timestamptz
);

create table if not exists public.pontos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  servico_id  uuid not null references public.servicos (id) on delete cascade,
  usuario     uuid not null,
  tipo        text not null check (tipo in ('chegada', 'foto', 'saida')),
  lat         double precision,
  lng         double precision,
  precisao    double precision,
  foto        text,                                    -- caminho no Storage (bucket "fotos")
  obs         text,
  criado_em   timestamptz not null default now()      -- hora do servidor (não dá para "voltar o relógio")
);

create table if not exists public.relatorios (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas (id) on delete cascade,
  servico_id     uuid not null unique references public.servicos (id) on delete cascade,
  usuario        uuid not null,
  texto          text,
  materiais      jsonb not null default '[]'::jsonb,   -- [{descricao, qtd, un}]
  assinatura     text,                                  -- caminho no Storage
  assinante      text,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  constraint relatorios_mat check (jsonb_typeof(materiais) = 'array' and jsonb_array_length(materiais) <= 200)
);

create index if not exists servicos_emp_idx on public.servicos (empresa_id, status, data_prevista);
create index if not exists servicos_resp_idx on public.servicos (responsavel, status);
create unique index if not exists servicos_num_idx on public.servicos (empresa_id, numero);
create index if not exists pontos_serv_idx on public.pontos (servico_id, criado_em);
create index if not exists pontos_usu_idx on public.pontos (usuario, criado_em);

-- caminho de arquivo precisa estar na pasta da empresa: <empresa_id>/...
create or replace function public.caminho_da_empresa(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select p is null or (p ~ '^[0-9a-f-]{36}/[A-Za-z0-9/_.-]{1,200}$' and split_part(p, '/', 1) = public.minha_empresa()::text and p not like '%..%');
$$;

-- a pessoa pode trabalhar nesta ordem? (gestor: qualquer uma da empresa; equipe: só a dela)
create or replace function public.posso_na_os(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.servicos s where s.id = p_id and s.empresa_id = public.minha_empresa()
                 and (public.sou_gestor() or s.responsavel = auth.uid() or s.criado_por = auth.uid()));
$$;

create or replace function public.tg_servico() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext('os:' || new.empresa_id::text));
    select coalesce(max(numero), 0) + 1 into new.numero from public.servicos where empresa_id = new.empresa_id;
    new.criado_por := auth.uid();
    if not public.sou_gestor() then              -- quem é da equipe só abre ordem para si mesmo
      new.responsavel := auth.uid();
      new.status := 'aberta';
    end if;
  else
    new.numero := old.numero;
    new.criado_por := old.criado_por;
  end if;
  if new.responsavel is not null and not exists (select 1 from public.membros m where m.usuario = new.responsavel and m.empresa_id = new.empresa_id) then
    raise exception 'O responsável precisa ser da equipe da empresa.';
  end if;
  if new.cliente_id is not null and not exists (select 1 from public.clientes c where c.id = new.cliente_id and c.empresa_id = new.empresa_id) then
    raise exception 'Cliente não encontrado na empresa.';
  end if;
  if new.orcamento_id is not null and not exists (select 1 from public.orcamentos o where o.id = new.orcamento_id and o.empresa_id = new.empresa_id) then
    raise exception 'Orçamento não encontrado na empresa.';
  end if;
  if new.maps_url is not null and new.maps_url !~ '^https://' then new.maps_url := null; end if;
  new.titulo := left(trim(new.titulo), 200);
  new.concluida_em := case when new.status = 'concluida' then coalesce(new.concluida_em, now()) else null end;
  new.atualizado_em := now();
  return new;
end $$;

drop trigger if exists a_empresa on public.servicos;
create trigger a_empresa before insert or update on public.servicos for each row execute function public.tg_da_empresa();
drop trigger if exists b_servico on public.servicos;
create trigger b_servico before insert or update on public.servicos for each row execute function public.tg_servico();

-- chegada, foto ou saída (GPS e hora do servidor)
create or replace function public.registrar_ponto(p_servico uuid, p_tipo text, p_lat double precision default null, p_lng double precision default null,
                                                  p_precisao double precision default null, p_foto text default null, p_obs text default null)
returns public.pontos
language plpgsql volatile security definer set search_path = public as $$
declare s public.servicos; r public.pontos;
begin
  if not public.empresa_liberada() then raise exception 'Sem permissão para gravar. Se o período de teste ou a assinatura venceu, fale com o suporte.'; end if;
  if p_tipo not in ('chegada', 'foto', 'saida') then raise exception 'Tipo inválido.'; end if;
  if not public.posso_na_os(p_servico) then raise exception 'Esta ordem de serviço não é sua.'; end if;
  select * into s from public.servicos where id = p_servico for update;
  if s.status in ('concluida', 'cancelada') then raise exception 'Esta ordem de serviço já foi encerrada.'; end if;
  if not public.caminho_da_empresa(p_foto) or (p_foto is not null and split_part(p_foto, '/', 2) <> s.id::text) then raise exception 'Foto inválida.'; end if;
  if p_lat is not null and (p_lat not between -90 and 90 or p_lng is null or p_lng not between -180 and 180) then raise exception 'Localização inválida.'; end if;
  insert into public.pontos (empresa_id, servico_id, usuario, tipo, lat, lng, precisao, foto, obs)
  values (s.empresa_id, s.id, auth.uid(), p_tipo, p_lat, p_lng, p_precisao, p_foto, left(nullif(trim(p_obs), ''), 500))
  returning * into r;
  if p_tipo = 'chegada' and s.status in ('aberta', 'agendada') then
    update public.servicos set status = 'andamento' where id = s.id;
  end if;
  return r;
end $$;

-- relatório final (o que foi feito, materiais usados e assinatura); p_concluir encerra a ordem
create or replace function public.salvar_relatorio(p_servico uuid, p jsonb, p_concluir boolean default false) returns public.relatorios
language plpgsql volatile security definer set search_path = public as $$
declare s public.servicos; r public.relatorios; v_mat jsonb := '[]'::jsonb; i jsonb;
begin
  if not public.empresa_liberada() then raise exception 'Sem permissão para gravar. Se o período de teste ou a assinatura venceu, fale com o suporte.'; end if;
  if not public.posso_na_os(p_servico) then raise exception 'Esta ordem de serviço não é sua.'; end if;
  select * into s from public.servicos where id = p_servico for update;
  if s.status = 'cancelada' then raise exception 'Esta ordem de serviço foi cancelada.'; end if;
  if s.status = 'concluida' and not public.sou_gestor() then raise exception 'Esta ordem de serviço já foi concluída. Peça ao responsável para reabrir.'; end if;
  if not public.caminho_da_empresa(p ->> 'assinatura') or (nullif(p ->> 'assinatura', '') is not null and split_part(p ->> 'assinatura', '/', 2) <> s.id::text) then raise exception 'Assinatura inválida.'; end if;
  if jsonb_typeof(p -> 'materiais') = 'array' then
    for i in select * from jsonb_array_elements(p -> 'materiais') limit 200 loop
      if jsonb_typeof(i) = 'object' and coalesce(trim(i ->> 'descricao'), '') <> '' then
        v_mat := v_mat || jsonb_build_object('descricao', left(trim(i ->> 'descricao'), 200),
          'qtd', case when coalesce(i ->> 'qtd', '') ~ '^[0-9]+(\.[0-9]+)?$' then (i ->> 'qtd')::numeric else 1 end,
          'un', left(coalesce(nullif(trim(i ->> 'un'), ''), 'un'), 10));
      end if;
    end loop;
  end if;
  insert into public.relatorios (empresa_id, servico_id, usuario, texto, materiais, assinatura, assinante)
  values (s.empresa_id, s.id, auth.uid(), left(nullif(trim(p ->> 'texto'), ''), 5000), v_mat, nullif(p ->> 'assinatura', ''), left(nullif(trim(p ->> 'assinante'), ''), 120))
  on conflict (servico_id) do update set
    usuario = excluded.usuario, texto = excluded.texto, materiais = excluded.materiais,
    assinatura = coalesce(excluded.assinatura, public.relatorios.assinatura),
    assinante = coalesce(excluded.assinante, public.relatorios.assinante), atualizado_em = now()
  returning * into r;
  if p_concluir then update public.servicos set status = 'concluida' where id = s.id; end if;
  return r;
end $$;

alter table public.servicos enable row level security;
alter table public.pontos enable row level security;
alter table public.relatorios enable row level security;

drop policy if exists ver on public.servicos;
create policy ver on public.servicos for select to authenticated
  using (empresa_id = public.minha_empresa() and (public.sou_gestor() or responsavel = auth.uid() or criado_por = auth.uid()));
drop policy if exists criar on public.servicos;
create policy criar on public.servicos for insert to authenticated with check (empresa_id = public.minha_empresa() and public.empresa_liberada());
drop policy if exists mudar on public.servicos;
create policy mudar on public.servicos for update to authenticated
  using (empresa_id = public.minha_empresa() and public.empresa_liberada() and public.sou_gestor()) with check (empresa_id = public.minha_empresa());
drop policy if exists apagar on public.servicos;
create policy apagar on public.servicos for delete to authenticated
  using (empresa_id = public.minha_empresa() and public.empresa_liberada() and public.sou_gestor());

drop policy if exists ver on public.pontos;
create policy ver on public.pontos for select to authenticated using (empresa_id = public.minha_empresa() and (public.sou_gestor() or usuario = auth.uid()));
drop policy if exists apagar on public.pontos;
create policy apagar on public.pontos for delete to authenticated using (empresa_id = public.minha_empresa() and public.sou_gestor());
drop policy if exists ver on public.relatorios;
create policy ver on public.relatorios for select to authenticated using (empresa_id = public.minha_empresa() and public.posso_na_os(servico_id));

revoke all on public.servicos, public.pontos, public.relatorios from anon;
revoke insert, update on public.pontos, public.relatorios from authenticated;
revoke delete on public.relatorios from authenticated;
grant select, insert, update, delete on public.servicos to authenticated;
grant select, delete on public.pontos to authenticated;
grant select on public.relatorios to authenticated;
revoke execute on function public.registrar_ponto(uuid, text, double precision, double precision, double precision, text, text),
  public.salvar_relatorio(uuid, jsonb, boolean) from public, anon;
grant execute on function public.registrar_ponto(uuid, text, double precision, double precision, double precision, text, text),
  public.salvar_relatorio(uuid, jsonb, boolean), public.posso_na_os(uuid), public.caminho_da_empresa(text) to authenticated;

-- ---------- Storage: fotos e assinaturas (privado, pasta de cada empresa) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "agestor fotos ver" on storage.objects;
create policy "agestor fotos ver" on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = public.minha_empresa()::text);
drop policy if exists "agestor fotos enviar" on storage.objects;
create policy "agestor fotos enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = public.minha_empresa()::text and public.empresa_liberada());
drop policy if exists "agestor fotos apagar" on storage.objects;
create policy "agestor fotos apagar" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = public.minha_empresa()::text and public.sou_gestor());

-- =====================================================================
-- 💰 PAGAMENTOS DA EQUIPE
-- "pessoas" são quem recebe (com ou sem acesso ao app: diarista também entra).
-- Só dono/administrador vê e lança; cada pessoa ligada a um login vê só os
-- próprios pagamentos. Comprovantes ficam no Storage em <empresa>/pagamentos/.
-- =====================================================================

create table if not exists public.pessoas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresas (id) on delete cascade,
  nome        text not null check (length(trim(nome)) between 1 and 120),
  funcao      text,
  telefone    text,
  pix         text,                                   -- chave Pix: o app reconhece o comprovante por ela
  diaria      numeric(10, 2) check (diaria is null or diaria >= 0),
  usuario     uuid,                                   -- login no app (opcional)
  ativo       boolean not null default true,
  obs         text,
  criado_em   timestamptz not null default now()
);
create unique index if not exists pessoas_usuario_idx on public.pessoas (empresa_id, usuario) where usuario is not null;
create index if not exists pessoas_emp_idx on public.pessoas (empresa_id, nome);

create table if not exists public.pagamentos (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas (id) on delete cascade,
  pessoa_id     uuid references public.pessoas (id) on delete set null,
  valor         numeric(12, 2) not null check (valor > 0),
  pago_em       timestamptz not null,
  tipo          text not null default 'diaria' check (tipo in ('diaria', 'salario', 'adiantamento', 'vale', 'reembolso', 'outro')),
  forma         text not null default 'pix' check (forma in ('pix', 'dinheiro', 'transferencia', 'outro')),
  favorecido    text,                                 -- nome como saiu no comprovante
  id_transacao  text,                                 -- evita lançar o mesmo Pix duas vezes
  descricao     text,
  comprovante   text,                                 -- caminho no Storage
  criado_por    uuid,
  criado_em     timestamptz not null default now()
);
create unique index if not exists pagamentos_trans_idx on public.pagamentos (empresa_id, id_transacao) where id_transacao is not null;
create index if not exists pagamentos_emp_idx on public.pagamentos (empresa_id, pago_em desc);
create index if not exists pagamentos_pes_idx on public.pagamentos (pessoa_id, pago_em);

create or replace function public.minha_pessoa() returns uuid
language sql stable security definer set search_path = public as $$
  select p.id from public.pessoas p where p.usuario = auth.uid() and p.empresa_id = public.minha_empresa();
$$;

create or replace function public.tg_pessoa() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.nome := left(trim(new.nome), 120);
  if new.usuario is not null and not exists (select 1 from public.membros m where m.usuario = new.usuario and m.empresa_id = new.empresa_id) then
    raise exception 'O login escolhido não é da equipe da empresa.';
  end if;
  return new;
end $$;

create or replace function public.tg_pagamento() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.criado_por := auth.uid(); else new.criado_por := old.criado_por; end if;
  if new.pessoa_id is not null and not exists (select 1 from public.pessoas p where p.id = new.pessoa_id and p.empresa_id = new.empresa_id) then
    raise exception 'Pessoa não encontrada na empresa.';
  end if;
  if new.comprovante is not null and (split_part(new.comprovante, '/', 1) <> new.empresa_id::text or split_part(new.comprovante, '/', 2) <> 'pagamentos'
      or new.comprovante like '%..%') then
    raise exception 'Comprovante inválido.';
  end if;
  new.id_transacao := nullif(left(regexp_replace(coalesce(new.id_transacao, ''), '\s', '', 'g'), 80), '');
  new.favorecido := left(nullif(trim(new.favorecido), ''), 120);
  return new;
end $$;

drop trigger if exists a_empresa on public.pessoas;
create trigger a_empresa before insert or update on public.pessoas for each row execute function public.tg_da_empresa();
drop trigger if exists b_pessoa on public.pessoas;
create trigger b_pessoa before insert or update on public.pessoas for each row execute function public.tg_pessoa();
drop trigger if exists a_empresa on public.pagamentos;
create trigger a_empresa before insert or update on public.pagamentos for each row execute function public.tg_da_empresa();
drop trigger if exists b_pagamento on public.pagamentos;
create trigger b_pagamento before insert or update on public.pagamentos for each row execute function public.tg_pagamento();

alter table public.pessoas enable row level security;
alter table public.pagamentos enable row level security;

drop policy if exists ver on public.pessoas;
create policy ver on public.pessoas for select to authenticated
  using (empresa_id = public.minha_empresa() and (public.sou_gestor() or usuario = auth.uid()));
drop policy if exists ver on public.pagamentos;
create policy ver on public.pagamentos for select to authenticated
  using (empresa_id = public.minha_empresa() and (public.sou_gestor() or pessoa_id = public.minha_pessoa()));
do $$
declare t text;
begin
  foreach t in array array['pessoas', 'pagamentos'] loop
    execute format('drop policy if exists criar on public.%I', t);
    execute format('create policy criar on public.%I for insert to authenticated with check (empresa_id = public.minha_empresa() and public.empresa_liberada() and public.sou_gestor())', t);
    execute format('drop policy if exists mudar on public.%I', t);
    execute format('create policy mudar on public.%I for update to authenticated using (empresa_id = public.minha_empresa() and public.empresa_liberada() and public.sou_gestor()) with check (empresa_id = public.minha_empresa())', t);
    execute format('drop policy if exists apagar on public.%I', t);
    execute format('create policy apagar on public.%I for delete to authenticated using (empresa_id = public.minha_empresa() and public.empresa_liberada() and public.sou_gestor())', t);
  end loop;
end $$;

revoke all on public.pessoas, public.pagamentos from anon;
grant select, insert, update, delete on public.pessoas, public.pagamentos to authenticated;
grant execute on function public.minha_pessoa() to authenticated;

-- comprovantes: só gestor envia; quem é da equipe só abre o comprovante dos próprios pagamentos
drop policy if exists "agestor fotos ver" on storage.objects;
create policy "agestor fotos ver" on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = public.minha_empresa()::text
         and ((storage.foldername(name))[2] is distinct from 'pagamentos' or public.sou_gestor()
              or exists (select 1 from public.pagamentos p where p.comprovante = name and p.pessoa_id = public.minha_pessoa())));
drop policy if exists "agestor fotos enviar" on storage.objects;
create policy "agestor fotos enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = public.minha_empresa()::text and public.empresa_liberada()
              and ((storage.foldername(name))[2] is distinct from 'pagamentos' or public.sou_gestor()));

-- =====================================================================
-- 🧾 COMPRAS E DESPESAS (só dono e administrador)
-- Nota lida pelo app (foto, PDF, XML) ou lançada à mão. A mesma nota não entra
-- duas vezes (chave de acesso). O último preço pago vai para o catálogo como custo.
-- =====================================================================

create table if not exists public.compras (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references public.empresas (id) on delete cascade,
  tipo             text not null default 'material' check (tipo in ('material', 'despesa')),
  categoria        text,                                -- despesa: combustivel, veiculo, alimentacao, pedagio, ferramentas, outros
  comprado_em      date not null,
  valor            numeric(12, 2) not null check (valor > 0),
  fornecedor       text,
  cnpj             text,
  chave            text,                                -- chave de acesso da NF-e/NFC-e (44 dígitos)
  numero_nota      text,
  itens            jsonb not null default '[]'::jsonb,  -- [{item, qtd, un, unit, valor}]
  forma_pagamento  text check (forma_pagamento in ('pix', 'dinheiro', 'cartao', 'boleto', 'fiado', 'outro')),
  pago             boolean not null default true,
  vencimento       date,
  pago_em          timestamptz,
  servico_id       uuid references public.servicos (id) on delete set null,   -- para qual ordem de serviço foi
  destino          text,
  descricao        text,
  nota             text,                                -- foto da nota no Storage: <empresa>/compras/...
  criado_por       uuid,
  criado_em        timestamptz not null default now(),
  constraint compras_itens check (jsonb_typeof(itens) = 'array' and jsonb_array_length(itens) <= 300)
);
create unique index if not exists compras_chave_idx on public.compras (empresa_id, chave) where chave is not null;
create index if not exists compras_emp_idx on public.compras (empresa_id, comprado_em desc);
create index if not exists compras_serv_idx on public.compras (servico_id);

-- último preço pago de cada item do catálogo (pela nota): tabela à parte para a equipe não ver o custo
create table if not exists public.custos (
  catalogo_id  uuid primary key references public.catalogo (id) on delete cascade,
  empresa_id   uuid not null references public.empresas (id) on delete cascade,
  custo        numeric(12, 2) not null check (custo >= 0),
  loja         text,
  comprado_em  date,
  atualizado_em timestamptz not null default now()
);

create or replace function public.tg_compra() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.criado_por := auth.uid(); else new.criado_por := old.criado_por; end if;
  new.chave := nullif(regexp_replace(coalesce(new.chave, ''), '\D', '', 'g'), '');
  if new.chave is not null and length(new.chave) <> 44 then new.chave := null; end if;
  if new.servico_id is not null and not exists (select 1 from public.servicos s where s.id = new.servico_id and s.empresa_id = new.empresa_id) then
    raise exception 'Ordem de serviço não encontrada na empresa.';
  end if;
  if new.nota is not null and (split_part(new.nota, '/', 1) <> new.empresa_id::text or split_part(new.nota, '/', 2) <> 'compras' or new.nota like '%..%') then
    raise exception 'Foto da nota inválida.';
  end if;
  if new.pago then new.pago_em := coalesce(new.pago_em, now()); else new.pago_em := null; end if;
  if jsonb_typeof(new.itens) <> 'array' then new.itens := '[]'::jsonb; end if;
  return new;
end $$;

drop trigger if exists a_empresa on public.compras;
create trigger a_empresa before insert or update on public.compras for each row execute function public.tg_da_empresa();
drop trigger if exists b_compra on public.compras;
create trigger b_compra before insert or update on public.compras for each row execute function public.tg_compra();

create or replace function public.tg_custo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.catalogo c where c.id = new.catalogo_id and c.empresa_id = new.empresa_id) then raise exception 'Item não encontrado no catálogo.'; end if;
  new.atualizado_em := now();
  return new;
end $$;
drop trigger if exists a_empresa on public.custos;
create trigger a_empresa before insert or update on public.custos for each row execute function public.tg_da_empresa();
drop trigger if exists b_custo on public.custos;
create trigger b_custo before insert or update on public.custos for each row execute function public.tg_custo();
alter table public.custos enable row level security;
drop policy if exists tudo on public.custos;
create policy tudo on public.custos for all to authenticated
  using (empresa_id = public.minha_empresa() and public.sou_gestor())
  with check (empresa_id = public.minha_empresa() and public.sou_gestor() and public.empresa_liberada());
revoke all on public.custos from anon;
grant select, insert, update, delete on public.custos to authenticated;

alter table public.compras enable row level security;
drop policy if exists ver on public.compras;
create policy ver on public.compras for select to authenticated using (empresa_id = public.minha_empresa() and public.sou_gestor());
drop policy if exists criar on public.compras;
create policy criar on public.compras for insert to authenticated with check (empresa_id = public.minha_empresa() and public.empresa_liberada() and public.sou_gestor());
drop policy if exists mudar on public.compras;
create policy mudar on public.compras for update to authenticated
  using (empresa_id = public.minha_empresa() and public.empresa_liberada() and public.sou_gestor()) with check (empresa_id = public.minha_empresa());
drop policy if exists apagar on public.compras;
create policy apagar on public.compras for delete to authenticated using (empresa_id = public.minha_empresa() and public.empresa_liberada() and public.sou_gestor());
revoke all on public.compras from anon;
grant select, insert, update, delete on public.compras to authenticated;

-- a pessoa pode usar esta pasta do bucket "fotos"? <empresa>/<ordem>/...: só quem pode trabalhar na ordem (gestor: todas; equipe: as dela).
-- As pastas "pagamentos" e "compras" têm a regra própria logo abaixo.
create or replace function public.posso_na_pasta(p_nome text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.sou_gestor()
      or split_part(p_nome, '/', 2) in ('pagamentos', 'compras')
      or (split_part(p_nome, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and public.posso_na_os(split_part(p_nome, '/', 2)::uuid));
$$;
revoke execute on function public.posso_na_pasta(text) from public, anon;
grant execute on function public.posso_na_pasta(text) to authenticated;

-- fotos: pastas "pagamentos" e "compras" só para gestor (e o próprio comprovante de quem recebeu)
drop policy if exists "agestor fotos ver" on storage.objects;
create policy "agestor fotos ver" on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = public.minha_empresa()::text
         and (coalesce((storage.foldername(name))[2], '') not in ('pagamentos', 'compras') or public.sou_gestor()
              or exists (select 1 from public.pagamentos p where p.comprovante = name and p.pessoa_id = public.minha_pessoa()))
         and public.posso_na_pasta(name));
drop policy if exists "agestor fotos enviar" on storage.objects;
create policy "agestor fotos enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = public.minha_empresa()::text and public.empresa_liberada()
              and (coalesce((storage.foldername(name))[2], '') not in ('pagamentos', 'compras') or public.sou_gestor())
              and public.posso_na_pasta(name));
