# Proxy 2.11.6 — deploy limpo no Vercel

Esta revisão não apaga arquivos durante o build. Todas as rotas públicas possuem Functions `.js` físicas e leves que delegam ao `api/index.js`.

O pacote não contém TypeScript no runtime e o gate `npm run test:deploy` verifica as 12 Functions, imports relativos, versão e contratos do roteamento LRCLIB + Vagalume antes do deploy.


## Correção 2.11.6 — rota de busca centralizada

`POST /api/proxy/lyrics/search` é reescrito internamente para `api/index` para evitar uma Function física isolada entrar em cold start/timeout antes de registrar a requisição. `api/index` emite `proxy_edge_entry` antes do carregamento do runtime; depois o router emite `proxy_request_start` e `proxy_request`. O contrato público do endpoint não muda.
