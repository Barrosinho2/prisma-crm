-- =====================================================================
-- Finanças pessoais — esquema base
-- Valores monetários sempre em centavos inteiros (bigint).
-- Toda linha pertence a um usuário (user_id) e só é visível para ele.
-- Chaves estrangeiras compostas (id, user_id) impedem apontar para
-- registros de outra pessoa.
-- =====================================================================

create schema if not exists privado;
revoke all on schema privado from public, anon;
grant usage on schema privado to authenticated;

-- ---------- quem pode usar o sistema ----------
create table public.fin_titulares (
  user_id   uuid primary key references auth.users on delete cascade,
  criado_em timestamptz not null default now()
);
alter table public.fin_titulares enable row level security;
create policy "titular vê o próprio registro" on public.fin_titulares
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.fin_titulares from anon, authenticated;
grant select on public.fin_titulares to authenticated;

create or replace function privado.fin_titular()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.fin_titulares t where t.user_id = auth.uid());
$$;
revoke all on function privado.fin_titular() from public, anon;
grant execute on function privado.fin_titular() to authenticated;

-- data de hoje no fuso de São Paulo
create or replace function privado.fin_hoje()
returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;
-- dia d do mês de m, limitado ao último dia do mês (31 → 30/28/29)
create or replace function privado.fin_dia(m date, d int)
returns date language sql immutable set search_path = '' as $$
  select make_date(extract(year from m)::int, extract(month from m)::int,
    least(d, extract(day from (date_trunc('month', m) + interval '1 month - 1 day'))::int));
$$;
revoke all on function privado.fin_hoje(), privado.fin_dia(date, int) from public, anon;
grant execute on function privado.fin_hoje(), privado.fin_dia(date, int) to authenticated;

-- ---------- configurações ----------
create table public.fin_config (
  user_id                 uuid primary key default auth.uid() references auth.users on delete cascade,
  nome                    text check (char_length(nome) <= 80),
  dia_salario             smallint check (dia_salario between 1 and 31),
  objetivo_economia_cents bigint not null default 0 check (objetivo_economia_cents >= 0),
  essenciais_cents        bigint check (essenciais_cents >= 0),
  moeda                   text not null default 'BRL' check (moeda = 'BRL'),
  formato_data            text not null default 'DD/MM/AAAA' check (formato_data = 'DD/MM/AAAA'),
  fuso                    text not null default 'America/Sao_Paulo' check (fuso = 'America/Sao_Paulo'),
  ocultar_valores         boolean not null default false,
  alerta_dias             smallint not null default 3 check (alerta_dias between 0 and 30),
  alertas_ativos          boolean not null default true,
  onboarding              jsonb not null default '{}'::jsonb,
  atualizado_em           timestamptz not null default now()
);

-- ---------- contas ----------
create table public.fin_contas (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users on delete cascade,
  nome                text not null check (char_length(btrim(nome)) between 1 and 60),
  tipo                text not null check (tipo in ('corrente','digital','poupanca','dinheiro','reserva')),
  saldo_inicial_cents bigint not null default 0 check (abs(saldo_inicial_cents) < 100000000000),
  data_saldo_inicial  date not null default privado.fin_hoje(),
  cor                 text check (cor ~ '^#[0-9A-Fa-f]{6}$'),
  ordem               int not null default 0,
  arquivada           boolean not null default false,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  unique (id, user_id)
);

-- ---------- categorias ----------
create table public.fin_categorias (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null default auth.uid() references auth.users on delete cascade,
  nome      text not null check (char_length(btrim(nome)) between 1 and 40),
  tipo      text not null check (tipo in ('despesa','receita')),
  icone     text not null default 'circle' check (char_length(icone) <= 40),
  cor       text not null default '#875364' check (cor ~ '^#[0-9A-Fa-f]{6}$'),
  ordem     int not null default 0,
  oculta    boolean not null default false,
  essencial boolean not null default false,
  criado_em timestamptz not null default now(),
  unique (id, user_id)
);
create unique index fin_categorias_nome_unico on public.fin_categorias (user_id, tipo, lower(btrim(nome)));

-- ---------- cartões ----------
create table public.fin_cartoes (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users on delete cascade,
  nome               text not null check (char_length(btrim(nome)) between 1 and 60),
  instituicao        text check (char_length(instituicao) <= 60),
  limite_cents       bigint not null check (limite_cents >= 0 and limite_cents < 100000000000),
  dia_fechamento     smallint not null check (dia_fechamento between 1 and 31),
  dia_vencimento     smallint not null check (dia_vencimento between 1 and 31),
  conta_pagamento_id uuid,
  cor                text not null default '#621F32' check (cor ~ '^#[0-9A-Fa-f]{6}$'),
  arquivado          boolean not null default false,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  unique (id, user_id),
  foreign key (conta_pagamento_id, user_id) references public.fin_contas (id, user_id)
);

-- ---------- recorrências (salário fixo, assinaturas, contas fixas) ----------
create table public.fin_recorrencias (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users on delete cascade,
  tipo            text not null check (tipo in ('receita','despesa')),
  nome            text not null check (char_length(btrim(nome)) between 1 and 80),
  valor_cents     bigint not null check (valor_cents > 0 and valor_cents < 100000000000),
  dia             smallint not null check (dia between 1 and 31),
  categoria_id    uuid,
  conta_id        uuid,
  cartao_id       uuid,
  forma_pagamento text check (forma_pagamento in ('pix','debito','dinheiro','boleto','transferencia','credito','debito_automatico','outro')),
  inicio          date not null,
  fim             date,
  ativa           boolean not null default true,
  essencial       boolean not null default false,
  obs             text check (char_length(obs) <= 500),
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (id, user_id),
  check (fim is null or fim >= inicio),
  check (tipo = 'despesa' or cartao_id is null),
  foreign key (categoria_id, user_id) references public.fin_categorias (id, user_id),
  foreign key (conta_id, user_id)     references public.fin_contas (id, user_id),
  foreign key (cartao_id, user_id)    references public.fin_cartoes (id, user_id)
);

-- ---------- faturas, compras e parcelas ----------
create table public.fin_faturas (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  cartao_id  uuid not null,
  fechamento date not null,
  vencimento date not null,
  criado_em  timestamptz not null default now(),
  unique (id, user_id),
  unique (cartao_id, vencimento),
  check (vencimento >= fechamento),
  foreign key (cartao_id, user_id) references public.fin_cartoes (id, user_id) on delete cascade
);

create table public.fin_compras (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users on delete cascade,
  cartao_id         uuid not null,
  descricao         text not null check (char_length(btrim(descricao)) between 1 and 120),
  valor_total_cents bigint not null check (valor_total_cents > 0 and valor_total_cents < 100000000000),
  parcelas          smallint not null check (parcelas between 1 and 48),
  data_compra       date not null,
  categoria_id      uuid,
  obs               text check (char_length(obs) <= 500),
  cancelada         boolean not null default false,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  unique (id, user_id),
  foreign key (cartao_id, user_id)    references public.fin_cartoes (id, user_id) on delete cascade,
  foreign key (categoria_id, user_id) references public.fin_categorias (id, user_id)
);

create table public.fin_parcelas (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  compra_id   uuid not null,
  fatura_id   uuid not null,
  numero      smallint not null check (numero >= 1),
  valor_cents bigint not null check (valor_cents > 0),
  competencia date not null check (extract(day from competencia) = 1),
  unique (compra_id, numero),
  foreign key (compra_id, user_id) references public.fin_compras (id, user_id) on delete cascade,
  foreign key (fatura_id, user_id) references public.fin_faturas (id, user_id) on delete cascade
);

-- ---------- lançamentos (receitas, despesas, contas a pagar) ----------
create table public.fin_lancamentos (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users on delete cascade,
  tipo            text not null check (tipo in ('receita','despesa')),
  descricao       text not null check (char_length(btrim(descricao)) between 1 and 120),
  valor_cents     bigint not null check (valor_cents > 0 and valor_cents < 100000000000),
  data_prevista   date not null,
  data_efetiva    date,
  status          text not null default 'pendente' check (status in ('pendente','efetivado','cancelado')),
  categoria_id    uuid,
  conta_id        uuid,
  cartao_id       uuid,
  compra_id       uuid,
  forma_pagamento text check (forma_pagamento in ('pix','debito','dinheiro','boleto','transferencia','credito','debito_automatico','outro')),
  recorrencia_id  uuid,
  competencia     date check (competencia is null or extract(day from competencia) = 1),
  obs             text check (char_length(obs) <= 500),
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (id, user_id),
  -- a mesma recorrência nunca gera dois lançamentos no mesmo mês
  unique (recorrencia_id, competencia),
  check ((status = 'efetivado') = (data_efetiva is not null)),
  -- algo efetivado sai de (ou entra em) uma conta, ou virou compra no cartão
  check (status <> 'efetivado' or conta_id is not null or compra_id is not null),
  check (compra_id is null or (tipo = 'despesa' and cartao_id is not null)),
  check ((recorrencia_id is null) = (competencia is null)),
  foreign key (categoria_id, user_id)   references public.fin_categorias (id, user_id),
  foreign key (conta_id, user_id)       references public.fin_contas (id, user_id),
  foreign key (cartao_id, user_id)      references public.fin_cartoes (id, user_id),
  foreign key (compra_id, user_id)      references public.fin_compras (id, user_id),
  foreign key (recorrencia_id, user_id) references public.fin_recorrencias (id, user_id)
);

-- ---------- transferências entre contas próprias ----------
create table public.fin_transferencias (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  origem_id   uuid not null,
  destino_id  uuid not null,
  valor_cents bigint not null check (valor_cents > 0 and valor_cents < 100000000000),
  data        date not null,
  descricao   text check (char_length(descricao) <= 120),
  cancelada   boolean not null default false,
  criado_em   timestamptz not null default now(),
  check (origem_id <> destino_id),
  foreign key (origem_id, user_id)  references public.fin_contas (id, user_id),
  foreign key (destino_id, user_id) references public.fin_contas (id, user_id)
);

-- ---------- pagamentos de fatura ----------
create table public.fin_pagamentos_fatura (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  fatura_id   uuid not null,
  conta_id    uuid not null,
  valor_cents bigint not null check (valor_cents > 0 and valor_cents < 100000000000),
  data        date not null,
  cancelado   boolean not null default false,
  criado_em   timestamptz not null default now(),
  foreign key (fatura_id, user_id) references public.fin_faturas (id, user_id) on delete cascade,
  foreign key (conta_id, user_id)  references public.fin_contas (id, user_id)
);

-- ---------- metas e reserva de emergência ----------
create table public.fin_metas (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  nome        text not null check (char_length(btrim(nome)) between 1 and 60),
  alvo_cents  bigint not null check (alvo_cents > 0 and alvo_cents < 100000000000),
  prazo       date,
  conta_id    uuid,
  emergencia  boolean not null default false,
  meses_alvo  smallint check (meses_alvo between 1 and 36),
  icone       text not null default 'target' check (char_length(icone) <= 40),
  arquivada   boolean not null default false,
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (id, user_id),
  foreign key (conta_id, user_id) references public.fin_contas (id, user_id)
);
create unique index fin_metas_uma_emergencia on public.fin_metas (user_id) where emergencia and not arquivada;

create table public.fin_movimentos_meta (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  meta_id     uuid not null,
  tipo        text not null check (tipo in ('aporte','retirada')),
  valor_cents bigint not null check (valor_cents > 0 and valor_cents < 100000000000),
  data        date not null,
  conta_id    uuid,
  obs         text check (char_length(obs) <= 300),
  cancelado   boolean not null default false,
  criado_em   timestamptz not null default now(),
  foreign key (meta_id, user_id)  references public.fin_metas (id, user_id) on delete cascade,
  foreign key (conta_id, user_id) references public.fin_contas (id, user_id)
);

-- ---------- orçamentos (um limite por categoria a partir de um mês) ----------
create table public.fin_orcamentos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  categoria_id uuid not null,
  competencia  date not null check (extract(day from competencia) = 1),
  limite_cents bigint not null check (limite_cents >= 0 and limite_cents < 100000000000),
  criado_em    timestamptz not null default now(),
  unique (user_id, categoria_id, competencia),
  foreign key (categoria_id, user_id) references public.fin_categorias (id, user_id) on delete cascade
);

-- ---------- registro de alterações financeiras ----------
create table public.fin_auditoria (
  id        bigint generated always as identity primary key,
  user_id   uuid not null references auth.users on delete cascade,
  tabela    text not null,
  registro  uuid,
  operacao  text not null,
  antes     jsonb,
  depois    jsonb,
  em        timestamptz not null default now()
);

-- ---------- índices ----------
create index on public.fin_lancamentos (user_id, data_prevista);
create index on public.fin_lancamentos (user_id, data_efetiva);
create index on public.fin_parcelas (user_id, competencia);
create index on public.fin_parcelas (fatura_id);
create index on public.fin_parcelas (compra_id, user_id);
create index on public.fin_compras (cartao_id, user_id);
create index on public.fin_compras (categoria_id, user_id);
create index on public.fin_faturas (cartao_id, user_id);
create index on public.fin_transferencias (origem_id, user_id);
create index on public.fin_transferencias (destino_id, user_id);
create index on public.fin_pagamentos_fatura (fatura_id, user_id);
create index on public.fin_pagamentos_fatura (conta_id, user_id);
create index on public.fin_movimentos_meta (meta_id, user_id);
create index on public.fin_movimentos_meta (conta_id, user_id);
create index on public.fin_orcamentos (categoria_id, user_id);
create index on public.fin_recorrencias (categoria_id, user_id);
create index on public.fin_recorrencias (conta_id, user_id);
create index on public.fin_recorrencias (cartao_id, user_id);
create index on public.fin_cartoes (conta_pagamento_id, user_id);
create index on public.fin_metas (conta_id, user_id);
create index on public.fin_auditoria (user_id, em desc);
create index on public.fin_lancamentos (categoria_id, user_id);
create index on public.fin_lancamentos (conta_id, user_id);
create index on public.fin_lancamentos (cartao_id, user_id);
create index on public.fin_lancamentos (compra_id, user_id);
create index on public.fin_lancamentos (recorrencia_id, user_id);
