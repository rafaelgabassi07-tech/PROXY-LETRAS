# Proxy 2.7.4 — deploy compatível com Vercel

Esta revisão não apaga arquivos durante o build. Todas as rotas públicas possuem Functions `.js` físicas e leves que delegam ao `api/index.js`.

Isso evita o erro em que o Vercel identifica uma Function antes do build e depois não a encontra porque um script de limpeza a removeu.

O pacote não contém TypeScript. Se o projeto remoto ainda tiver `.ts` antigos versionados, remova-os do repositório antes do commit; `.vercelignore` também os exclui em fluxos de upload que respeitam essa configuração.
