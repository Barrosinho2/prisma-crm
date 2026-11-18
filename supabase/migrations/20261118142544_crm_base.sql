-- Prisma CRM: banco compartilhado em tempo real, só para os sócios cadastrados em membros

-- quem pode entrar
create table public.membros (
  email text primary key check (email = lower(email)),
  socio text not null check (socio in ('rafael', 'pedro')),
  convite text,
  criado_em timestamptz not null default now()
);
alter table public.membros enable row level security;

create or replace function public.eh_membro()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.membros m
    where m.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.eh_membro() from public, anon;
grant execute on function public.eh_membro() to authenticated;

create policy "cada membro vê o próprio cadastro" on public.membros
  for select to authenticated
  using (email = lower(coalesce((select auth.jwt()) ->> 'email', '')));

-- documentos do CRM (mesmo formato coleção/documento usado pelo app)
create table public.docs (
  col text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid(),
  primary key (col, id)
);
alter table public.docs enable row level security;
alter table public.docs replica identity full;

create policy "membros leem" on public.docs for select to authenticated using ((select public.eh_membro()));
create policy "membros criam" on public.docs for insert to authenticated with check ((select public.eh_membro()));
create policy "membros alteram" on public.docs for update to authenticated using ((select public.eh_membro())) with check ((select public.eh_membro()));
create policy "membros apagam" on public.docs for delete to authenticated using ((select public.eh_membro()));

create or replace function public.docs_carimbo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end;
$$;
create trigger docs_carimbo before insert or update on public.docs
  for each row execute function public.docs_carimbo();

-- mescla profunda de objetos (mesmo comportamento do update do app)
create or replace function public.jsonb_mescla(a jsonb, b jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  k text;
  v jsonb;
  r jsonb;
begin
  if a is null or jsonb_typeof(a) <> 'object' or b is null or jsonb_typeof(b) <> 'object' then
    return b;
  end if;
  r := a;
  for k, v in select * from jsonb_each(b) loop
    if jsonb_typeof(v) = 'object' and jsonb_typeof(r -> k) = 'object' then
      r := jsonb_set(r, array[k], public.jsonb_mescla(r -> k, v));
    else
      r := jsonb_set(r, array[k], v, true);
    end if;
  end loop;
  return r;
end;
$$;

create or replace function public.doc_atualiza(p_col text, p_id text, p_dados jsonb)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.docs
     set data = public.jsonb_mescla(data, p_dados)
   where col = p_col and id = p_id;
  return found;
end;
$$;
revoke all on function public.doc_atualiza(text, text, jsonb) from public, anon;
grant execute on function public.doc_atualiza(text, text, jsonb) to authenticated;

-- trava curta para só uma aba rodar o piloto automático por vez
create table public.travas (
  caminho text primary key,
  dono text not null,
  expira timestamptz not null
);
alter table public.travas enable row level security;
create policy "membros usam travas" on public.travas for all to authenticated
  using ((select public.eh_membro())) with check ((select public.eh_membro()));

create or replace function public.pega_trava(p_caminho text, p_dono text, p_ms integer)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  insert into public.travas as t (caminho, dono, expira)
  values (p_caminho, p_dono, now() + make_interval(secs => greatest(1000, least(600000, p_ms)) / 1000.0))
  on conflict (caminho) do update
    set dono = excluded.dono, expira = excluded.expira
    where t.expira < now() or t.dono = excluded.dono
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;
revoke all on function public.pega_trava(text, text, integer) from public, anon;
grant execute on function public.pega_trava(text, text, integer) to authenticated;

-- ninguém sem login mexe em nada
revoke all on table public.docs, public.membros, public.travas from anon;

-- tempo real
alter publication supabase_realtime add table public.docs;
