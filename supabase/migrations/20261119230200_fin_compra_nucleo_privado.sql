-- O núcleo que grava compra, faturas e parcelas fica no schema privado
-- (fora da API). A função pública vira SECURITY INVOKER e só repassa.
alter function public.fin_registrar_compra(uuid, uuid, text, bigint, int, date, uuid, text)
  set schema privado;
alter function privado.fin_registrar_compra(uuid, uuid, text, bigint, int, date, uuid, text)
  rename to fin_registrar_compra_nucleo;
revoke all on function privado.fin_registrar_compra_nucleo(uuid, uuid, text, bigint, int, date, uuid, text) from public, anon;
grant execute on function privado.fin_registrar_compra_nucleo(uuid, uuid, text, bigint, int, date, uuid, text) to authenticated;

create or replace function public.fin_registrar_compra(
  p_id uuid, p_cartao uuid, p_descricao text, p_total_cents bigint, p_parcelas int,
  p_data date, p_categoria uuid default null, p_obs text default null
) returns uuid
language sql security invoker set search_path = '' as $$
  select privado.fin_registrar_compra_nucleo(p_id, p_cartao, p_descricao, p_total_cents, p_parcelas, p_data, p_categoria, p_obs);
$$;
revoke all on function public.fin_registrar_compra(uuid, uuid, text, bigint, int, date, uuid, text) from public, anon;
grant execute on function public.fin_registrar_compra(uuid, uuid, text, bigint, int, date, uuid, text) to authenticated;

-- fin_confirmar chamava a função pública; continua funcionando pela nova pública.
