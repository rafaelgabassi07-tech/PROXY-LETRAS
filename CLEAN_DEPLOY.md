# Clean deploy — Proxy 2.7.3

Esta revisão usa uma única Vercel Function: `api/index.js`.

O build executa `scripts/prepare-vercel.mjs`, que remove Functions antigas existentes em `api/` antes do empacotamento. Isso protege deployments feitos sobre repositórios que ainda contêm rotas `.ts`/`.js` de revisões anteriores.

Para Git, ainda é recomendado remover os arquivos legados do repositório e criar um novo commit. O Vercel associa deployments Git ao SHA do commit.


## Vercel Output Directory

Use `public`. The build creates `public/index.html` explicitly, while API routes continue through `api/index.js`.
