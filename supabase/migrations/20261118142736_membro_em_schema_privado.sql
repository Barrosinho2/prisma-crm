-- a checagem de membro sai do schema exposto pela API
create schema if not exists privado;
revoke all on schema privado from public, anon;
grant usage on schema privado to authenticated;

create or replace function privado.eh_membro()
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
revoke all on function privado.eh_membro() from public, anon;
grant execute on function privado.eh_membro() to authenticated;

drop policy "membros leem" on public.docs;
drop policy "membros criam" on public.docs;
drop policy "membros alteram" on public.docs;
drop policy "membros apagam" on public.docs;
drop policy "membros usam travas" on public.travas;

create policy "membros leem" on public.docs for select to authenticated using ((select privado.eh_membro()));
create policy "membros criam" on public.docs for insert to authenticated with check ((select privado.eh_membro()));
create policy "membros alteram" on public.docs for update to authenticated using ((select privado.eh_membro())) with check ((select privado.eh_membro()));
create policy "membros apagam" on public.docs for delete to authenticated using ((select privado.eh_membro()));
create policy "membros usam travas" on public.travas for all to authenticated
  using ((select privado.eh_membro())) with check ((select privado.eh_membro()));

drop function public.eh_membro();
