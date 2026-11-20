-- Parcelas pagas antes de começar a usar o sistema.
-- Recorrências: quantas parcelas já tinham sido pagas antes do início.
alter table public.fin_recorrencias
  add column if not exists parcelas_anteriores smallint not null default 0
  check (parcelas_anteriores between 0 and 600);

-- Compras no cartão em andamento: as primeiras N parcelas já foram pagas
-- (não geram fatura nem entram nos relatórios; o valor total fica registrado).
alter table public.fin_compras
  add column if not exists parcelas_pagas_antes smallint not null default 0;
alter table public.fin_compras
  add constraint fin_compras_pagas_antes_ck check (parcelas_pagas_antes >= 0 and parcelas_pagas_antes < parcelas);

-- núcleo novo, com parcelas já pagas
create or replace function privado.fin_registrar_compra_andamento(
  p_id uuid, p_cartao uuid, p_descricao text, p_total_cents bigint, p_parcelas int,
  p_data date, p_categoria uuid, p_obs text, p_ja_pagas int
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  df int; dv int;
  fech date; base_mes date; m date; f date; v date; fid uuid;
  base bigint; resto bigint; i int; k int := coalesce(p_ja_pagas, 0);
begin
  if uid is null or not privado.fin_titular() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if exists (select 1 from public.fin_compras where id = p_id) then
    if exists (select 1 from public.fin_compras where id = p_id and user_id = uid) then return p_id; end if;
    raise exception 'Identificador já usado.' using errcode = '23505';
  end if;
  if p_total_cents is null or p_total_cents <= 0 then
    raise exception 'Informe um valor maior que zero.' using errcode = '22023';
  end if;
  if p_parcelas is null or p_parcelas < 1 or p_parcelas > 48 then
    raise exception 'Parcelas devem ficar entre 1 e 48.' using errcode = '22023';
  end if;
  if k < 0 or k >= p_parcelas then
    raise exception 'As parcelas já pagas precisam ser menos que o total.' using errcode = '22023';
  end if;
  if p_total_cents < p_parcelas then
    raise exception 'Valor pequeno demais para tantas parcelas.' using errcode = '22023';
  end if;
  select c.dia_fechamento, c.dia_vencimento into df, dv from public.fin_cartoes c where c.id = p_cartao and c.user_id = uid;
  if df is null then raise exception 'Cartão não encontrado.' using errcode = '22023'; end if;
  if p_categoria is not null and not exists (select 1 from public.fin_categorias where id = p_categoria and user_id = uid) then
    raise exception 'Categoria não encontrada.' using errcode = '22023';
  end if;

  insert into public.fin_compras (id, user_id, cartao_id, descricao, valor_total_cents, parcelas, data_compra, categoria_id, obs, parcelas_pagas_antes)
  values (p_id, uid, p_cartao, btrim(p_descricao), p_total_cents, p_parcelas, p_data, p_categoria, p_obs, k);

  fech := privado.fin_dia(p_data, df);
  if p_data >= fech then fech := privado.fin_dia((date_trunc('month', p_data) + interval '1 month')::date, df); end if;
  base_mes := date_trunc('month', fech)::date;
  base  := p_total_cents / p_parcelas;
  resto := p_total_cents - base * p_parcelas;

  for i in k .. p_parcelas - 1 loop
    m := (base_mes + make_interval(months => i))::date;
    f := privado.fin_dia(m, df);
    if dv > df then v := privado.fin_dia(m, dv); else v := privado.fin_dia((m + interval '1 month')::date, dv); end if;
    insert into public.fin_faturas (user_id, cartao_id, fechamento, vencimento) values (uid, p_cartao, f, v)
    on conflict (cartao_id, vencimento) do nothing;
    select id into fid from public.fin_faturas where cartao_id = p_cartao and vencimento = v;
    insert into public.fin_parcelas (user_id, compra_id, fatura_id, numero, valor_cents, competencia)
    values (uid, p_id, fid, i + 1, base + case when i = 0 then resto else 0 end,
            (date_trunc('month', p_data) + make_interval(months => i))::date);
  end loop;
  return p_id;
end $$;
revoke all on function privado.fin_registrar_compra_andamento(uuid, uuid, text, bigint, int, date, uuid, text, int) from public, anon;
grant execute on function privado.fin_registrar_compra_andamento(uuid, uuid, text, bigint, int, date, uuid, text, int) to authenticated;

-- o núcleo antigo passa a usar o novo (sem parcelas pagas)
create or replace function privado.fin_registrar_compra_nucleo(
  p_id uuid, p_cartao uuid, p_descricao text, p_total_cents bigint, p_parcelas int,
  p_data date, p_categoria uuid default null, p_obs text default null
) returns uuid
language sql security invoker set search_path = '' as $$
  select privado.fin_registrar_compra_andamento(p_id, p_cartao, p_descricao, p_total_cents, p_parcelas, p_data, p_categoria, p_obs, 0);
$$;

-- API pública para compra em andamento
create or replace function public.fin_registrar_compra_em_andamento(
  p_id uuid, p_cartao uuid, p_descricao text, p_total_cents bigint, p_parcelas int,
  p_data date, p_ja_pagas int, p_categoria uuid default null, p_obs text default null
) returns uuid
language sql security invoker set search_path = '' as $$
  select privado.fin_registrar_compra_andamento(p_id, p_cartao, p_descricao, p_total_cents, p_parcelas, p_data, p_categoria, p_obs, p_ja_pagas);
$$;
revoke all on function public.fin_registrar_compra_em_andamento(uuid, uuid, text, bigint, int, date, int, uuid, text) from public, anon;
grant execute on function public.fin_registrar_compra_em_andamento(uuid, uuid, text, bigint, int, date, int, uuid, text) to authenticated;
