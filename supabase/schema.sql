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
  select exists (select 1 from public.admins a where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', '')));
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
