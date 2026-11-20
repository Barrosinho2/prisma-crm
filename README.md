# Finanças pessoais

Sistema web de gestão financeira pessoal: contas e saldos, receitas e salário fixo, despesas, contas a pagar e assinaturas, cartões de crédito com parcelamento, orçamentos, metas e reserva de emergência, calendário, relatórios, projeção de saldo e exportação (CSV, Excel, PDF).

Identidade bordô (#621F32) e off-white (#F8F5F0), DM Sans + Playfair Display, ícones Lucide.

## Estrutura

```
app/                      aplicação web (React 19 + TypeScript + Vite + Tailwind 4)
  src/lib/motor.ts        todas as regras e cálculos financeiros (testados)
  src/lib/dados.tsx       leitura e gravação no Supabase
  src/pages/              as 10 páginas
  src/components/         layout, formulários, componentes visuais
  test/e2e.mjs            teste de interface ponta a ponta (Playwright)
supabase/migrations/      banco versionado (rodar em ordem)
supabase/testes/          testes de aceitação no banco (rodam e desfazem tudo)
```

## Regras financeiras

- Valores sempre em **centavos inteiros** (`bigint`), nunca ponto flutuante.
- **Receita prevista não é dinheiro disponível**: o saldo só muda quando o recebimento é confirmado.
- **Transferências entre contas próprias** não são receita nem despesa.
- **Metas**: guardar dinheiro é transferência para a conta da meta (ou separação dentro da conta), nunca despesa.
- **Cartão — critério de relatórios**:
  - *Consumo (competência)*: a compra conta parcela a parcela; a parcela *n* conta no mês da compra + (*n*−1).
  - *Fluxo de caixa*: o que saiu das contas, incluindo pagamentos de fatura.
  - O pagamento da fatura reduz o saldo da conta e a dívida, mas **não** cria nova despesa.
- **Fatura**: compra antes do dia de fechamento entra na fatura que fecha naquele mês; no dia do fechamento ou depois, na seguinte. Dia 31 vira o último dia do mês.
- **Disponível para gastar** = saldo das contas de uso livre − contas a pagar até o fim do mês − faturas que vencem no mês − valor separado em metas.
- Recorrências geram previsões até o fim do mês seguinte, **sem duplicar** (chave única recorrência + mês).
- Movimentações efetivadas não são apagadas: são canceladas e ficam no histórico. Toda alteração fica em `fin_auditoria`.
- Fuso **America/Sao_Paulo**, datas DD/MM/AAAA, moeda BRL.

## Banco (Supabase)

O banco está no projeto Supabase existente (`plnnmlooqbzwwcfsqmxg`), em tabelas próprias com prefixo `fin_`, separadas das demais. O plano gratuito permite 2 projetos e os dois já estavam ocupados.

Segurança:
- Row Level Security em todas as tabelas: cada usuário só lê e altera as próprias linhas.
- Chaves estrangeiras compostas `(id, user_id)` impedem apontar para dados de outra pessoa.
- Só contas listadas em `fin_titulares` usam o sistema (hoje: barrosinho05@gmail.com).
- Funções que gravam faturas e parcelas ficam no schema `privado`, fora da API.
- No navegador só fica a chave **publicável** (pública por definição).

Para liberar outro usuário (SQL Editor do Supabase):

```sql
insert into public.fin_titulares (user_id)
select id from auth.users where email = 'email@exemplo.com';
```

Para recriar o banco em outro projeto: rode os arquivos de `supabase/migrations/` em ordem (ajuste o e-mail do titular no fim de `..._fin_seguranca_e_regras.sql`).

Recomendado: em Authentication → Providers → Email, ativar **Leaked password protection**.

## Rodar no computador

Requisitos: Node 20 ou mais.

```bash
cd app
cp .env.example .env      # chaves públicas do Supabase
npm install
npm run dev               # http://localhost:5173
```

Testes:

```bash
npm test                  # regras financeiras (vitest)
npm run build && node test/e2e.mjs   # interface completa com Supabase simulado
```

Os testes do banco real estão em `supabase/testes/testes_banco.sql`: rode no SQL Editor; o resultado aparece como mensagem de erro e nada é gravado.

## Publicar na Vercel

1. Suba este repositório no GitHub.
2. Na Vercel: **Add New → Project**, importe o repositório.
3. **Root Directory**: `app`. Framework: Vite (detectado). Build: `npm run build`. Output: `dist`.
4. Variáveis de ambiente: `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` (os valores estão em `app/.env.example`).
5. Deploy. O `vercel.json` já cuida das rotas da aplicação e dos cabeçalhos de segurança.

## Limitações conhecidas

- Não há integração bancária: tudo é lançado pela pessoa (decisão do projeto).
- “Esqueci minha senha” por e-mail não está na tela de entrada; a troca de senha fica em Configurações.
- Avisos de vencimento aparecem dentro do sistema (não há e-mail ou push).
