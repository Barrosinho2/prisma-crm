-- Acesso dos sócios por código de convite.
-- Cada sócio tem uma linha em membros. O e-mail e a conta são ligados no primeiro acesso,
-- quando a pessoa usa o código que recebeu. O código é guardado só como hash (sha-256).

drop policy if exists "cada membro vê o próprio cadastro" on public.membros;
drop table if exists public.membros;

create table public.membros (
  socio text primary key check (socio in ('rafael', 'pedro')),
  user_id uuid unique references auth.users (id) on delete set null,
  email text unique check (email = lower(email)),
  convite_hash text,
  convite_expira timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
insert into public.membros (socio) values ('rafael'), ('pedro');
alter table public.membros enable row level security;

create or replace function privado.eh_membro()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.membros m where m.user_id = (select auth.uid()));
$$;

-- os sócios veem os dois cadastros (sem o hash do código); ninguém altera pela API
create policy "sócios veem os sócios" on public.membros
  for select to authenticated using ((select privado.eh_membro()));
revoke all on public.membros from anon, authenticated;
grant select (socio, user_id, email, convite_expira, criado_em, atualizado_em) on public.membros to authenticated;

-- versão de cada documento: o app compara versões para nunca voltar a um dado antigo
alter table public.docs add column if not exists versao bigint not null default 1;

create or replace function public.docs_carimbo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  if tg_op = 'UPDATE' then
    new.versao := old.versao + 1;
  else
    new.versao := 1;
  end if;
  return new;
end;
$$;

-- atualizar mesclando campos devolve o documento novo (ou null se ele não existe mais)
drop function if exists public.doc_atualiza(text, text, jsonb);
create function public.doc_atualiza(p_col text, p_id text, p_dados jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  r public.docs;
begin
  update public.docs d
     set data = public.jsonb_mescla(d.data, p_dados)
   where d.col = p_col and d.id = p_id
  returning * into r;
  if not found then
    return null;
  end if;
  return jsonb_build_object('data', r.data, 'versao', r.versao);
end;
$$;
revoke all on function public.doc_atualiza(text, text, jsonb) from public, anon;
grant execute on function public.doc_atualiza(text, text, jsonb) to authenticated;

-- gera um código de convite para um sócio (uso interno: SQL do dono do projeto)
create or replace function privado.gera_convite(p_socio text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  alfabeto constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  b bytea := extensions.gen_random_bytes(12);
  codigo text := '';
begin
  if p_socio is null or p_socio not in ('rafael', 'pedro') then
    raise exception 'sócio inválido' using errcode = '22023';
  end if;
  for i in 0..11 loop
    codigo := codigo || substr(alfabeto, (get_byte(b, i) % length(alfabeto)) + 1, 1);
    if i in (3, 7) then
      codigo := codigo || '-';
    end if;
  end loop;
  update public.membros
     set convite_hash = encode(extensions.digest(codigo, 'sha256'), 'hex'),
         convite_expira = now() + interval '7 days',
         atualizado_em = now()
   where socio = p_socio;
  return codigo;
end;
$$;
revoke all on function privado.gera_convite(text) from public, anon, authenticated;
