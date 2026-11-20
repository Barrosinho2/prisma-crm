-- índices para as chaves estrangeiras de usuário (consultas por RLS ficam rápidas)
create index if not exists fin_cartoes_user_idx on public.fin_cartoes (user_id);
create index if not exists fin_compras_user_idx on public.fin_compras (user_id);
create index if not exists fin_contas_user_idx on public.fin_contas (user_id);
create index if not exists fin_faturas_user_idx on public.fin_faturas (user_id);
create index if not exists fin_movimentos_meta_user_idx on public.fin_movimentos_meta (user_id);
create index if not exists fin_pagamentos_fatura_user_idx on public.fin_pagamentos_fatura (user_id);
create index if not exists fin_parcelas_fatura_user_idx on public.fin_parcelas (fatura_id, user_id);
create index if not exists fin_recorrencias_user_idx on public.fin_recorrencias (user_id);
create index if not exists fin_transferencias_user_idx on public.fin_transferencias (user_id);
create index if not exists fin_categorias_user_idx on public.fin_categorias (user_id);
create index if not exists fin_metas_user_idx on public.fin_metas (user_id);
create index if not exists fin_orcamentos_user_idx on public.fin_orcamentos (user_id);
