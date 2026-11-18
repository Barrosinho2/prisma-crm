-- Proteção contra perda de dados.
-- 1) Histórico: toda versão anterior de um documento (alterado ou apagado) fica guardada por 180 dias.
-- 2) Cópia diária do banco inteiro dentro do Postgres, guardada por 60 dias.
-- (A cópia externa diária vai para o GitHub, pela função exportar.)

create table if not exists privado.docs_historico (
  n bigserial primary key,
  col text not null,
  id text not null,
  data jsonb not null,
  versao bigint,
  acao text not null check (acao in ('alterado', 'apagado')),
  feito_em timestamptz not null default now(),
  feito_por uuid
);
create index if not exists docs_historico_doc on privado.docs_historico (col, id, n desc);
create index if not exists docs_historico_quando on privado.docs_historico (feito_em);
revoke all on privado.docs_historico from public, anon, authenticated;

create or replace function privado.guarda_historico()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.data is not distinct from old.data then
    return null;
  end if;
  insert into privado.docs_historico (col, id, data, versao, acao, feito_por)
  values (old.col, old.id, old.data, old.versao, case when tg_op = 'DELETE' then 'apagado' else 'alterado' end, auth.uid());
  return null;
end;
$$;
revoke all on function privado.guarda_historico() from public, anon, authenticated;

drop trigger if exists docs_historico on public.docs;
create trigger docs_historico after update or delete on public.docs
  for each row execute function privado.guarda_historico();

create table if not exists privado.backups (
  dia date primary key,
  criado_em timestamptz not null default now(),
  documentos integer not null,
  dados jsonb not null
);
revoke all on privado.backups from public, anon, authenticated;

create or replace function privado.faz_backup()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  insert into privado.backups (dia, documentos, dados)
  select (now() at time zone 'America/Sao_Paulo')::date, count(*),
         coalesce(jsonb_agg(jsonb_build_object('col', d.col, 'id', d.id, 'data', d.data, 'versao', d.versao, 'atualizado_em', d.atualizado_em) order by d.col, d.id), '[]'::jsonb)
    from public.docs d
  on conflict (dia) do update set criado_em = now(), documentos = excluded.documentos, dados = excluded.dados
  returning documentos into n;
  delete from privado.backups where dia < (now() at time zone 'America/Sao_Paulo')::date - 60;
  delete from privado.docs_historico where feito_em < now() - interval '180 days';
  return n;
end;
$$;
revoke all on function privado.faz_backup() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule('prisma-crm-backup-diario', '7 6 * * *', 'select privado.faz_backup()');
select privado.faz_backup();
