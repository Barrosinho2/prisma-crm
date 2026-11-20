-- Testes de aceitação no banco real, dentro de uma transação que é
-- sempre desfeita no final (o resultado volta na mensagem de erro).
-- Nada fica gravado. Uso: rodar inteiro no SQL editor / execute_sql.
do $$
declare
  r uuid := (select id from auth.users where email = 'barrosinho05@gmail.com');
  p uuid := (select id from auth.users where email = 'pedrocarrielvila@gmail.com');
  rel text[] := '{}';
  ca uuid := gen_random_uuid(); cb uuid := gen_random_uuid(); cr uuid := gen_random_uuid();
  rec uuid := gen_random_uuid(); ass uuid := gen_random_uuid(); car uuid := gen_random_uuid();
  comp uuid := gen_random_uuid(); meta uuid := gen_random_uuid(); desp uuid := gen_random_uuid();
  l uuid; n int; v bigint; ok boolean; txt text; fat uuid;
  mes date := date_trunc('month', privado.fin_hoje())::date;

  -- saldo de uma conta pelas regras do sistema
  saldo_sql text := $q$
    select c.saldo_inicial_cents
      + coalesce((select sum(case when tipo='receita' then valor_cents else -valor_cents end)
                    from fin_lancamentos where conta_id = c.id and status='efetivado' and compra_id is null),0)
      + coalesce((select sum(valor_cents) from fin_transferencias where destino_id=c.id and not cancelada),0)
      - coalesce((select sum(valor_cents) from fin_transferencias where origem_id=c.id and not cancelada),0)
      - coalesce((select sum(valor_cents) from fin_pagamentos_fatura where conta_id=c.id and not cancelado),0)
      - coalesce((select sum(mm.valor_cents) from fin_movimentos_meta mm join fin_metas m on m.id=mm.meta_id
                   where not mm.cancelado and mm.tipo='aporte' and mm.conta_id=c.id and m.conta_id is not null and m.conta_id<>c.id),0)
      + coalesce((select sum(mm.valor_cents) from fin_movimentos_meta mm join fin_metas m on m.id=mm.meta_id
                   where not mm.cancelado and mm.tipo='aporte' and m.conta_id=c.id and mm.conta_id is not null and mm.conta_id<>c.id),0)
      - coalesce((select sum(mm.valor_cents) from fin_movimentos_meta mm join fin_metas m on m.id=mm.meta_id
                   where not mm.cancelado and mm.tipo='retirada' and m.conta_id=c.id and mm.conta_id is not null and mm.conta_id<>c.id),0)
      + coalesce((select sum(mm.valor_cents) from fin_movimentos_meta mm join fin_metas m on m.id=mm.meta_id
                   where not mm.cancelado and mm.tipo='retirada' and mm.conta_id=c.id and m.conta_id is not null and m.conta_id<>c.id),0)
    from public.fin_contas c where c.id = $1 $q$;

begin
  -- ===== entra como Rafael =====
  perform set_config('request.jwt.claims', json_build_object('sub', r, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform set_config('search_path', 'public, extensions', true);

  perform fin_iniciar();
  select count(*) into n from fin_categorias;
  rel := rel || format('categorias padrão: %s', n);

  insert into fin_contas (id, nome, tipo, saldo_inicial_cents) values
    (ca, 'Teste Corrente', 'corrente', 100000), (cb, 'Teste Digital', 'digital', 0), (cr, 'Teste Reserva', 'reserva', 0);

  -- Teste 1 — salário só entra quando confirmado
  insert into fin_recorrencias (id, tipo, nome, valor_cents, dia, conta_id, inicio)
  values (rec, 'receita', 'Salário teste', 250000, 5, ca, mes);
  perform fin_gerar_previsoes();
  execute saldo_sql into v using ca;
  rel := rel || format('T1 saldo antes de confirmar: %s (esperado 100000) %s', v, case when v=100000 then 'OK' else 'FALHOU' end);
  select id into l from fin_lancamentos where recorrencia_id = rec and competencia = mes;
  perform fin_confirmar(l, privado.fin_hoje());
  txt := fin_confirmar(l, privado.fin_hoje());           -- clique duplo
  execute saldo_sql into v using ca;
  rel := rel || format('T1 saldo após confirmar 2x: %s (esperado 350000, 2ª=%s) %s', v, txt, case when v=350000 and txt='ja_efetivado' then 'OK' else 'FALHOU' end);

  -- Teste 2 — despesa de R$ 100
  insert into fin_lancamentos (id, tipo, descricao, valor_cents, data_prevista, data_efetiva, status, conta_id)
  values (desp, 'despesa', 'Despesa teste', 10000, privado.fin_hoje(), privado.fin_hoje(), 'efetivado', ca);
  execute saldo_sql into v using ca;
  rel := rel || format('T2 saldo após despesa: %s (esperado 340000) %s', v, case when v=340000 then 'OK' else 'FALHOU' end);

  -- Teste 3 — transferência não muda o patrimônio
  insert into fin_transferencias (origem_id, destino_id, valor_cents, data) values (ca, cb, 20000, privado.fin_hoje());
  v := 0;
  declare s bigint; begin
    foreach l in array array[ca, cb, cr] loop execute saldo_sql into s using l; v := v + s; end loop;
  end;
  rel := rel || format('T3 patrimônio após transferir 200: %s (esperado 340000) %s', v, case when v=340000 then 'OK' else 'FALHOU' end);
  select count(*) into n from fin_lancamentos where descricao ilike '%transfer%';
  rel := rel || format('T3 transferência virou receita/despesa? %s', case when n=0 then 'não — OK' else 'sim — FALHOU' end);

  -- Teste 4 — compra parcelada no cartão
  insert into fin_cartoes (id, nome, limite_cents, dia_fechamento, dia_vencimento, conta_pagamento_id)
  values (car, 'Cartão teste', 500000, 10, 17, ca);
  perform fin_registrar_compra(comp, car, 'Notebook teste', 120001, 3, date '2026-11-20');
  perform fin_registrar_compra(comp, car, 'Notebook teste', 120001, 3, date '2026-11-20');  -- repetição
  select count(*), sum(valor_cents) into n, v from fin_parcelas where compra_id = comp;
  rel := rel || format('T4 parcelas: %s somando %s (esperado 3 / 120001) %s', n, v, case when n=3 and v=120001 then 'OK' else 'FALHOU' end);
  select string_agg(to_char(f.vencimento,'DD/MM/YYYY') || '=' || p2.valor_cents, ', ' order by p2.numero) into txt
    from fin_parcelas p2 join fin_faturas f on f.id = p2.fatura_id where p2.compra_id = comp;
  rel := rel || format('T4 faturas: %s (esperado 17/12/2026=40001, 17/01/2027=40000, 17/02/2027=40000) %s', txt,
    case when txt = '17/12/2026=40001, 17/01/2027=40000, 17/02/2027=40000' then 'OK' else 'FALHOU' end);
  select count(*) into n from fin_lancamentos where compra_id = comp or descricao = 'Notebook teste';
  rel := rel || format('T4 compra criou despesa de conta duplicada? %s', case when n=0 then 'não — OK' else 'sim — FALHOU' end);
  select f.id into fat from fin_faturas f where f.cartao_id = car order by vencimento limit 1;
  insert into fin_pagamentos_fatura (fatura_id, conta_id, valor_cents, data) values (fat, ca, 40001, privado.fin_hoje());
  execute saldo_sql into v using ca;
  rel := rel || format('T4 saldo após pagar fatura: %s (esperado 279999) %s', v, case when v=279999 then 'OK' else 'FALHOU' end);
  -- datas de fechamento
  perform fin_registrar_compra(gen_random_uuid(), car, 'No dia do fechamento', 1000, 1, date '2026-11-10');
  perform fin_registrar_compra(gen_random_uuid(), car, 'Antes do fechamento', 1000, 1, date '2026-11-09');
  select string_agg(c.descricao || '→' || to_char(f.vencimento,'DD/MM/YYYY'), '; ' order by c.descricao) into txt
    from fin_compras c join fin_parcelas p2 on p2.compra_id = c.id join fin_faturas f on f.id = p2.fatura_id
   where c.cartao_id = car and c.parcelas = 1;
  rel := rel || format('T10 fechamento: %s %s', txt,
    case when txt = 'Antes do fechamento→17/11/2026; No dia do fechamento→17/12/2026' then 'OK' else 'FALHOU' end);
  rel := rel || format('T10 dia 31 em fevereiro: %s', privado.fin_dia(date '2027-02-01', 31));

  -- Teste 5 — meta não é despesa
  insert into fin_metas (id, nome, alvo_cents, conta_id) values (meta, 'Meta teste', 600000, cr);
  insert into fin_movimentos_meta (meta_id, tipo, valor_cents, data, conta_id) values (meta, 'aporte', 15000, privado.fin_hoje(), ca);
  execute saldo_sql into v using cr;
  rel := rel || format('T5 reserva recebeu: %s (esperado 15000) %s', v, case when v=15000 then 'OK' else 'FALHOU' end);
  select count(*) into n from fin_lancamentos where tipo='despesa' and status='efetivado' and user_id = r and descricao <> 'Despesa teste';
  rel := rel || format('T5 virou despesa de consumo? %s', case when n=0 then 'não — OK' else 'sim — FALHOU' end);
  begin
    insert into fin_movimentos_meta (meta_id, tipo, valor_cents, data, conta_id) values (meta, 'retirada', 20000, privado.fin_hoje(), ca);
    rel := rel || text 'T5 retirada maior que o guardado: aceita — FALHOU';
  exception when others then rel := rel || ('T5 retirada maior que o guardado bloqueada — OK (' || sqlerrm || ')');
  end;

  -- Teste 6 — assinatura sem duplicar
  insert into fin_recorrencias (id, tipo, nome, valor_cents, dia, conta_id, inicio) values (ass, 'despesa', 'Streaming teste', 3990, 15, ca, mes);
  perform fin_gerar_previsoes(); perform fin_gerar_previsoes(); perform fin_gerar_previsoes();
  select count(*) into n from fin_lancamentos where recorrencia_id = ass and competencia = mes;
  rel := rel || format('T6 ocorrências da assinatura no mês após 3 gerações: %s %s', n, case when n=1 then 'OK' else 'FALHOU' end);
  update fin_recorrencias set valor_cents = 4590 where id = ass;
  perform fin_aplicar_recorrencia(ass);
  select valor_cents into v from fin_lancamentos where recorrencia_id = ass and competencia = mes;
  rel := rel || format('T6 novo valor aplicado ao pendente: %s %s', v, case when v=4590 then 'OK' else 'FALHOU' end);

  -- integridade
  select count(*) into n from pg_policies where tablename = 'fin_lancamentos' and cmd = 'DELETE' and qual like '%efetivado%';
  rel := rel || format('Regra que impede apagar lançamento efetivado: %s', case when n=1 then 'OK' else 'FALHOU' end);
  begin
    update fin_transferencias set valor_cents = 1 where origem_id = ca;
    rel := rel || text 'Alterar valor de transferência: aceito — FALHOU';
  exception when others then rel := rel || text 'Alterar valor de transferência bloqueado — OK';
  end;
  begin
    update fin_compras set valor_total_cents = 1 where id = comp;
    rel := rel || text 'Alterar valor de compra: aceito — FALHOU';
  exception when others then rel := rel || text 'Alterar valor de compra bloqueado — OK';
  end;
  select count(*) into n from fin_auditoria where registro in (ca, desp, comp);
  rel := rel || format('Auditoria registrou %s alterações', n);

  -- ===== Teste 9 — outra pessoa logada =====
  execute 'reset role';
  insert into public.fin_titulares (user_id) values (p) on conflict do nothing;  -- só nesta transação
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from fin_contas where id in (ca, cb, cr);
  rel := rel || format('T9 outro usuário vê contas do Rafael: %s %s', n, case when n=0 then 'OK' else 'FALHOU' end);
  update fin_contas set nome = 'invadido' where id = ca; get diagnostics n = row_count;
  rel := rel || format('T9 outro usuário altera conta do Rafael: %s linhas %s', n, case when n=0 then 'OK' else 'FALHOU' end);
  begin
    insert into fin_lancamentos (tipo, descricao, valor_cents, data_prevista, data_efetiva, status, conta_id)
    values ('despesa', 'x', 100, privado.fin_hoje(), privado.fin_hoje(), 'efetivado', ca);
    rel := rel || text 'T9 lançar na conta do Rafael: aceito — FALHOU';
  exception when others then rel := rel || text 'T9 lançar na conta do Rafael bloqueado — OK';
  end;
  begin
    perform fin_registrar_compra(gen_random_uuid(), car, 'x', 100, 1, privado.fin_hoje());
    rel := rel || text 'T9 comprar no cartão do Rafael: aceito — FALHOU';
  exception when others then rel := rel || text 'T9 comprar no cartão do Rafael bloqueado — OK';
  end;
  select count(*) into n from fin_auditoria where user_id = r;
  rel := rel || format('T9 outro usuário lê auditoria do Rafael: %s %s', n, case when n=0 then 'OK' else 'FALHOU' end);

  -- sem estar na lista de titulares
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  begin
    insert into fin_contas (nome, tipo) values ('x', 'corrente');
    rel := rel || text 'Não titular cria conta: aceito — FALHOU';
  exception when others then rel := rel || text 'Não titular cria conta bloqueado — OK';
  end;

  -- anônimo
  execute 'reset role';
  execute 'set local role anon';
  begin
    perform count(*) from fin_contas;
    rel := rel || text 'Anônimo lê tabelas: aceito — FALHOU';
  exception when others then rel := rel || text 'Anônimo lê tabelas bloqueado — OK';
  end;
  execute 'reset role';

  raise exception 'RELATORIO%', E'\n' || array_to_string(rel, E'\n');
end $$;
