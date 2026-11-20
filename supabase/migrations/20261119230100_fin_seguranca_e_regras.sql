-- =====================================================================
-- Finanças pessoais — segurança (RLS), regras de integridade e funções
-- =====================================================================

-- ---------- RLS: cada usuário só enxerga e altera o que é seu ----------
do $$
declare t text;
begin
  foreach t in array array['fin_config','fin_contas','fin_categorias','fin_cartoes','fin_recorrencias',
    'fin_faturas','fin_compras','fin_parcelas','fin_lancamentos','fin_transferencias',
    'fin_pagamentos_fatura','fin_metas','fin_movimentos_meta','fin_orcamentos','fin_auditoria']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('create policy "dono lê" on public.%I for select to authenticated using (user_id = (select auth.uid()) and (select privado.fin_titular()))', t);
  end loop;

  -- tabelas com escrita livre do dono (inclui apagar)
  foreach t in array array['fin_config','fin_contas','fin_categorias','fin_cartoes','fin_recorrencias','fin_metas','fin_orcamentos']
  loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy "dono cria" on public.%I for insert to authenticated with check (user_id = (select auth.uid()) and (select privado.fin_titular()))', t);
    execute format('create policy "dono altera" on public.%I for update to authenticated using (user_id = (select auth.uid()) and (select privado.fin_titular())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "dono apaga" on public.%I for delete to authenticated using (user_id = (select auth.uid()) and (select privado.fin_titular()))', t);
  end loop;

  -- movimentações: criar e alterar (cancelar), nunca apagar — preserva o histórico
  foreach t in array array['fin_compras','fin_transferencias','fin_pagamentos_fatura','fin_movimentos_meta','fin_lancamentos']
  loop
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('create policy "dono cria" on public.%I for insert to authenticated with check (user_id = (select auth.uid()) and (select privado.fin_titular()))', t);
    execute format('create policy "dono altera" on public.%I for update to authenticated using (user_id = (select auth.uid()) and (select privado.fin_titular())) with check (user_id = (select auth.uid()))', t);
  end loop;

  -- faturas, parcelas e auditoria: só leitura (escritas via funções do servidor)
  foreach t in array array['fin_faturas','fin_parcelas','fin_auditoria']
  loop
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- lançamento só pode ser apagado se nunca foi efetivado e não veio de recorrência
-- (os de recorrência são cancelados, para não serem gerados de novo)
grant delete on public.fin_lancamentos to authenticated;
create policy "dono apaga previsto avulso" on public.fin_lancamentos for delete to authenticated
  using (user_id = (select auth.uid()) and (select privado.fin_titular())
         and status <> 'efetivado' and recorrencia_id is null and compra_id is null);

-- ---------- atualizado_em ----------
create or replace function privado.fin_tocar() returns trigger language plpgsql set search_path = '' as $$
begin new.atualizado_em := now(); return new; end $$;
do $$
declare t text;
begin
  foreach t in array array['fin_config','fin_contas','fin_cartoes','fin_recorrencias','fin_compras','fin_lancamentos','fin_metas']
  loop
    execute format('create trigger tocar before update on public.%I for each row execute function privado.fin_tocar()', t);
  end loop;
end $$;

-- ---------- registro de alterações ----------
create or replace function privado.fin_auditar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.fin_auditoria (user_id, tabela, registro, operacao, antes, depois)
  values (coalesce(new.user_id, old.user_id), tg_table_name,
          coalesce(new.id, old.id), tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
revoke all on function privado.fin_auditar() from public, anon, authenticated;
do $$
declare t text;
begin
  foreach t in array array['fin_contas','fin_cartoes','fin_recorrencias','fin_compras','fin_lancamentos',
    'fin_transferencias','fin_pagamentos_fatura','fin_metas','fin_movimentos_meta','fin_orcamentos']
  loop
    execute format('create trigger auditar after insert or update or delete on public.%I for each row execute function privado.fin_auditar()', t);
  end loop;
end $$;

-- ---------- compra no cartão: valor, parcelas, data e cartão não mudam depois ----------
create or replace function privado.fin_compra_imutavel() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.valor_total_cents <> old.valor_total_cents or new.parcelas <> old.parcelas
     or new.data_compra <> old.data_compra or new.cartao_id <> old.cartao_id then
    raise exception 'Para mudar valor, parcelas, data ou cartão, cancele a compra e registre de novo.' using errcode = '22023';
  end if;
  if old.cancelada and not new.cancelada then
    raise exception 'Uma compra cancelada não pode ser reativada.' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger imutavel before update on public.fin_compras for each row execute function privado.fin_compra_imutavel();

-- movimentações canceladas não voltam; valores de transferências/pagamentos não mudam
create or replace function privado.fin_mov_imutavel() returns trigger language plpgsql set search_path = '' as $$
declare j_old jsonb := to_jsonb(old) - 'cancelado' - 'cancelada' - 'descricao' - 'obs';
        j_new jsonb := to_jsonb(new) - 'cancelado' - 'cancelada' - 'descricao' - 'obs';
begin
  if j_old <> j_new then
    raise exception 'Esta movimentação não pode ser alterada; cancele e registre outra.' using errcode = '22023';
  end if;
  if coalesce((to_jsonb(old)->>'cancelado')::boolean, (to_jsonb(old)->>'cancelada')::boolean)
     and not coalesce((to_jsonb(new)->>'cancelado')::boolean, (to_jsonb(new)->>'cancelada')::boolean) then
    raise exception 'Uma movimentação cancelada não pode ser reativada.' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger imutavel before update on public.fin_transferencias for each row execute function privado.fin_mov_imutavel();
create trigger imutavel before update on public.fin_pagamentos_fatura for each row execute function privado.fin_mov_imutavel();
create trigger imutavel before update on public.fin_movimentos_meta for each row execute function privado.fin_mov_imutavel();

-- ---------- metas: retirada nunca maior que o guardado ----------
create or replace function privado.fin_checa_meta() returns trigger
language plpgsql security definer set search_path = '' as $$
declare saldo bigint;
begin
  perform 1 from public.fin_metas where id = new.meta_id for update;   -- serializa movimentos da mesma meta
  select coalesce(sum(case when tipo = 'aporte' then valor_cents else -valor_cents end), 0)
    into saldo
    from public.fin_movimentos_meta
   where meta_id = new.meta_id and not cancelado and id <> new.id;
  if not new.cancelado then
    saldo := saldo + case when new.tipo = 'aporte' then new.valor_cents else -new.valor_cents end;
  end if;
  if saldo < 0 then
    raise exception 'A meta não tem esse valor guardado.' using errcode = '22023';
  end if;
  return new;
end $$;
revoke all on function privado.fin_checa_meta() from public, anon, authenticated;
create trigger checa_meta before insert or update on public.fin_movimentos_meta
  for each row execute function privado.fin_checa_meta();

-- ---------- compra no cartão com parcelas distribuídas nas faturas ----------
-- Regra da fatura: compra feita antes do dia de fechamento entra na fatura
-- que fecha neste mês; no dia do fechamento ou depois, na do mês seguinte.
-- O vencimento é no mesmo mês do fechamento se o dia de vencimento for maior,
-- senão no mês seguinte. Parcela n cai n-1 faturas depois da primeira.
-- Competência (para relatórios de consumo): parcela n = mês da compra + (n-1).
create or replace function public.fin_registrar_compra(
  p_id uuid, p_cartao uuid, p_descricao text, p_total_cents bigint, p_parcelas int,
  p_data date, p_categoria uuid default null, p_obs text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  df int; dv int;
  fech date; base_mes date; m date; f date; v date; fid uuid;
  base bigint; resto bigint; i int;
begin
  if uid is null or not privado.fin_titular() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if exists (select 1 from public.fin_compras where id = p_id) then
    if exists (select 1 from public.fin_compras where id = p_id and user_id = uid) then
      return p_id;                                   -- repetição da mesma requisição
    end if;
    raise exception 'Identificador já usado.' using errcode = '23505';
  end if;
  if p_total_cents is null or p_total_cents <= 0 then
    raise exception 'Informe um valor maior que zero.' using errcode = '22023';
  end if;
  if p_parcelas is null or p_parcelas < 1 or p_parcelas > 48 then
    raise exception 'Parcelas devem ficar entre 1 e 48.' using errcode = '22023';
  end if;
  if p_total_cents < p_parcelas then
    raise exception 'Valor pequeno demais para tantas parcelas.' using errcode = '22023';
  end if;
  select c.dia_fechamento, c.dia_vencimento into df, dv
    from public.fin_cartoes c where c.id = p_cartao and c.user_id = uid;
  if df is null then
    raise exception 'Cartão não encontrado.' using errcode = '22023';
  end if;
  if p_categoria is not null and not exists
     (select 1 from public.fin_categorias where id = p_categoria and user_id = uid) then
    raise exception 'Categoria não encontrada.' using errcode = '22023';
  end if;

  insert into public.fin_compras (id, user_id, cartao_id, descricao, valor_total_cents, parcelas, data_compra, categoria_id, obs)
  values (p_id, uid, p_cartao, btrim(p_descricao), p_total_cents, p_parcelas, p_data, p_categoria, p_obs);

  fech := privado.fin_dia(p_data, df);
  if p_data >= fech then
    fech := privado.fin_dia((date_trunc('month', p_data) + interval '1 month')::date, df);
  end if;
  base_mes := date_trunc('month', fech)::date;
  base  := p_total_cents / p_parcelas;
  resto := p_total_cents - base * p_parcelas;

  for i in 0 .. p_parcelas - 1 loop
    m := (base_mes + make_interval(months => i))::date;
    f := privado.fin_dia(m, df);
    if dv > df then v := privado.fin_dia(m, dv);
    else v := privado.fin_dia((m + interval '1 month')::date, dv);
    end if;
    insert into public.fin_faturas (user_id, cartao_id, fechamento, vencimento)
    values (uid, p_cartao, f, v)
    on conflict (cartao_id, vencimento) do nothing;
    select id into fid from public.fin_faturas where cartao_id = p_cartao and vencimento = v;
    insert into public.fin_parcelas (user_id, compra_id, fatura_id, numero, valor_cents, competencia)
    values (uid, p_id, fid, i + 1, base + case when i = 0 then resto else 0 end,
            (date_trunc('month', p_data) + make_interval(months => i))::date);
  end loop;
  return p_id;
end $$;
revoke all on function public.fin_registrar_compra(uuid, uuid, text, bigint, int, date, uuid, text) from public, anon;
grant execute on function public.fin_registrar_compra(uuid, uuid, text, bigint, int, date, uuid, text) to authenticated;

-- ---------- previsões das recorrências (sem duplicar) ----------
create or replace function public.fin_gerar_previsoes(p_ate date default null)
returns int language plpgsql security invoker set search_path = '' as $$
declare
  limite date := (date_trunc('month', privado.fin_hoje()) + interval '2 months' - interval '1 day')::date;
  ate date := least(coalesce(p_ate, limite), limite);
  n int;
begin
  if auth.uid() is null or not privado.fin_titular() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  insert into public.fin_lancamentos (user_id, tipo, descricao, valor_cents, data_prevista, status,
    categoria_id, conta_id, cartao_id, forma_pagamento, recorrencia_id, competencia)
  select r.user_id, r.tipo, r.nome, r.valor_cents, privado.fin_dia(g.m::date, r.dia), 'pendente',
         r.categoria_id, r.conta_id, r.cartao_id, r.forma_pagamento, r.id, g.m::date
    from public.fin_recorrencias r
    cross join lateral generate_series(date_trunc('month', r.inicio),
                                       date_trunc('month', least(ate, coalesce(r.fim, ate))),
                                       interval '1 month') as g(m)
   where r.ativa and r.user_id = auth.uid()
     and privado.fin_dia(g.m::date, r.dia) >= r.inicio
     and (r.fim is null or privado.fin_dia(g.m::date, r.dia) <= r.fim)
  on conflict (recorrencia_id, competencia) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.fin_gerar_previsoes(date) from public, anon;
grant execute on function public.fin_gerar_previsoes(date) to authenticated;

-- aplica a edição de uma recorrência às ocorrências ainda pendentes deste mês em diante
create or replace function public.fin_aplicar_recorrencia(p_id uuid)
returns int language plpgsql security invoker set search_path = '' as $$
declare r public.fin_recorrencias; n int;
begin
  select * into r from public.fin_recorrencias where id = p_id and user_id = auth.uid();
  if r.id is null then raise exception 'Recorrência não encontrada.' using errcode = '22023'; end if;
  if not r.ativa then
    update public.fin_lancamentos set status = 'cancelado'
     where recorrencia_id = r.id and status = 'pendente' and data_prevista >= privado.fin_hoje();
    get diagnostics n = row_count;
    return n;
  end if;
  update public.fin_lancamentos l
     set descricao = r.nome, valor_cents = r.valor_cents,
         data_prevista = privado.fin_dia(l.competencia, r.dia),
         categoria_id = r.categoria_id, conta_id = r.conta_id, cartao_id = r.cartao_id,
         forma_pagamento = r.forma_pagamento
   where l.recorrencia_id = r.id and l.status = 'pendente'
     and l.competencia >= date_trunc('month', privado.fin_hoje())::date;
  get diagnostics n = row_count;
  -- ocorrências fora do novo período deixam de valer
  update public.fin_lancamentos l set status = 'cancelado'
   where l.recorrencia_id = r.id and l.status = 'pendente'
     and (l.data_prevista < r.inicio or (r.fim is not null and l.data_prevista > r.fim));
  return n;
end $$;
revoke all on function public.fin_aplicar_recorrencia(uuid) from public, anon;
grant execute on function public.fin_aplicar_recorrencia(uuid) to authenticated;

-- ---------- confirmar (receber/pagar) um lançamento ----------
create or replace function public.fin_confirmar(
  p_id uuid, p_data date, p_valor_cents bigint default null, p_conta uuid default null
) returns text
language plpgsql security invoker set search_path = '' as $$
declare l public.fin_lancamentos; cid uuid;
begin
  select * into l from public.fin_lancamentos where id = p_id and user_id = auth.uid() for update;
  if l.id is null then raise exception 'Lançamento não encontrado.' using errcode = '22023'; end if;
  if l.status = 'efetivado' then return 'ja_efetivado'; end if;   -- clique duplo não duplica
  if l.status = 'cancelado' then raise exception 'Lançamento cancelado.' using errcode = '22023'; end if;
  if p_data is null then raise exception 'Informe a data.' using errcode = '22023'; end if;

  if l.cartao_id is not null and l.tipo = 'despesa' then
    cid := gen_random_uuid();
    perform public.fin_registrar_compra(cid, l.cartao_id, l.descricao,
      coalesce(p_valor_cents, l.valor_cents), 1, p_data, l.categoria_id, 'Gerada por: ' || l.descricao);
    update public.fin_lancamentos
       set status = 'efetivado', data_efetiva = p_data, compra_id = cid,
           valor_cents = coalesce(p_valor_cents, l.valor_cents)
     where id = l.id;
  else
    if coalesce(p_conta, l.conta_id) is null then
      raise exception 'Escolha a conta.' using errcode = '22023';
    end if;
    update public.fin_lancamentos
       set status = 'efetivado', data_efetiva = p_data,
           conta_id = coalesce(p_conta, l.conta_id),
           valor_cents = coalesce(p_valor_cents, l.valor_cents)
     where id = l.id;
  end if;
  return 'efetivado';
end $$;
revoke all on function public.fin_confirmar(uuid, date, bigint, uuid) from public, anon;
grant execute on function public.fin_confirmar(uuid, date, bigint, uuid) to authenticated;

-- desfaz uma confirmação (volta a pendente; compra no cartão gerada é cancelada)
create or replace function public.fin_desfazer(p_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare l public.fin_lancamentos;
begin
  select * into l from public.fin_lancamentos where id = p_id and user_id = auth.uid() for update;
  if l.id is null or l.status <> 'efetivado' then return; end if;
  if l.compra_id is not null then
    update public.fin_compras set cancelada = true where id = l.compra_id;
  end if;
  update public.fin_lancamentos set status = 'pendente', data_efetiva = null, compra_id = null where id = l.id;
end $$;
revoke all on function public.fin_desfazer(uuid) from public, anon;
grant execute on function public.fin_desfazer(uuid) to authenticated;

-- ---------- primeiro acesso: categorias padrão (uma vez só) ----------
create or replace function public.fin_iniciar() returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or not privado.fin_titular() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  insert into public.fin_config (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  if not exists (select 1 from public.fin_categorias where user_id = auth.uid()) then
    insert into public.fin_categorias (nome, tipo, icone, cor, ordem, essencial) values
      ('Moradia','despesa','home','#621F32',1,true),
      ('Alimentação','despesa','utensils','#875364',2,true),
      ('Transporte','despesa','car','#9C6B4E',3,true),
      ('Saúde','despesa','heart-pulse','#5E7A6B',4,true),
      ('Educação','despesa','graduation-cap','#4F6A84',5,false),
      ('Assinaturas','despesa','repeat','#7A6A8C',6,false),
      ('Lazer','despesa','sparkles','#B0855B',7,false),
      ('Compras pessoais','despesa','shopping-bag','#A35C6E',8,false),
      ('Outros','despesa','circle','#817678',9,false),
      ('Salário','receita','briefcase','#4E7A5E',1,false),
      ('Rendimentos','receita','trending-up','#6B8E5A',2,false),
      ('Outras receitas','receita','plus-circle','#817678',3,false);
  end if;
end $$;
revoke all on function public.fin_iniciar() from public, anon;
grant execute on function public.fin_iniciar() to authenticated;

-- ---------- quem é o titular ----------
-- Conta liberada: Rafael (mesmo login usado no outro sistema deste banco).
insert into public.fin_titulares (user_id)
select id from auth.users where email = 'barrosinho05@gmail.com'
on conflict do nothing;
