# Deploy no Vercel — Proxy 2.7.4

## Mudança estrutural
A produção agora usa **uma única Function**: `api/index.js`.
Todas as rotas públicas são reescritas para ela pelo `vercel.json`.

O build executa `node scripts/prepare-vercel.mjs`. Esse script remove Functions antigas que possam ter permanecido no checkout do Vercel antes da etapa final de empacotamento.

## Configuração
- Framework Preset: Other
- Root Directory: `./`
- Build Command: use o projeto (`node scripts/prepare-vercel.mjs`)
- Install Command: automático
- Output Directory: vazio
- Node.js: 24.x

## Git
Se o projeto estiver conectado a Git, crie um **novo commit** com esta revisão. Um Redeploy do mesmo SHA pode reutilizar o deployment anterior. Remova os arquivos legados do Git quando possível.

## Teste
`GET https://proxy-letras.vercel.app/api/health`

Esperado: HTTP 200, `version: "2.7.4"`.
