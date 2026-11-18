# Prisma CRM

CRM da Prisma Systems: funil de leads, clientes, projetos, caixa, agenda e piloto automático, para os dois sócios, com os dados em tempo real.

## Como está montado

- **App**: um arquivo HTML só, sem framework (`src/`), montado por `build.py`.
- **Banco**: Supabase (Postgres). Tudo fica na tabela `docs` (coleção, id, dados em JSON), com acesso só para quem está em `membros` (Row Level Security) e tempo real pelo Supabase Realtime.
- **Login**: e-mail e senha (Supabase Auth). A conta de cada sócio é criada com um código de acesso de uso único, gerado em Ajustes pelo outro sócio.
- **Hospedagem**: Vercel, servindo a pasta `public/` (site estático, sem etapa de build).

## Montar

```bash
python3 build.py vercel   # gera public/ (site da Vercel)
python3 build.py          # gera dist/index.html (versão que roda dentro do Claude)
```

O endereço do Supabase e a chave publicável ficam em `src/vercel/config.json`. A chave publicável pode ficar no site: quem protege os dados são as políticas do banco.

## Supabase

- `supabase/migrations/`: tabelas, políticas e funções do banco.
- `supabase/functions/acesso`: primeiro acesso e troca de senha com código; geração de código por um sócio logado.
- `supabase/functions/ler-conversa`: lê conversas do WhatsApp com o Claude. Só funciona com o segredo `ANTHROPIC_API_KEY` configurado no projeto (Edge Functions → Secrets). Sem ele, o CRM preenche o básico sozinho.

## Testes

```bash
node test/flows.mjs      # fluxos principais (banco simulado)
node test/auto.mjs       # piloto automático
node test/conversas.mjs  # importação de conversas do WhatsApp
node test/vercel.mjs     # login, tempo real e reconexão (Supabase simulado)
```
