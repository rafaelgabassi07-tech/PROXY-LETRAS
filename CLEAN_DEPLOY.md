# Proxy 2.11.3 — deploy limpo no Vercel

Esta revisão não apaga arquivos durante o build. Todas as rotas públicas possuem Functions `.js` físicas e leves que delegam ao `api/index.js`.

O pacote não contém TypeScript no runtime e o gate `npm run test:deploy` verifica as 12 Functions, imports relativos, versão e contratos do roteamento LRCLIB + Vagalume antes do deploy.
