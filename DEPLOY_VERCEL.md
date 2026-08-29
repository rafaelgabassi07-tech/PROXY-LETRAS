# Deploy no Vercel — Proxy 2.6

## Estrutura de produção

Publique o conteúdo deste ZIP diretamente na raiz do projeto Vercel:

```text
/
├── api/
│   ├── health.ts
│   └── proxy/
│       ├── health.ts
│       ├── lyrics/search.ts
│       ├── lyrics/get.ts
│       └── ...
├── server/
├── index.html
├── package.json
└── vercel.json
```

`vercel.json` contém somente `framework: null`, selecionando **Other**. As Functions são descobertas automaticamente porque ficam dentro de `/api`, conforme o runtime Node oficial do Vercel. Não existe `server.ts` na raiz e não existe mapeamento manual `functions.server.ts`.

## Teste obrigatório após publicar

1. `https://proxy-letras.vercel.app/` deve abrir a página estática de status.
2. `https://proxy-letras.vercel.app/api/health` deve retornar JSON HTTP 200.
3. O JSON deve conter `status: "online"`.
4. `apiReady: true` confirma que o módulo de letras/GLX inicializou. Se `apiReady` for `false`, consulte `runtime.diagnostic`; o health continua vivo justamente para mostrar o erro de inicialização.

## Variáveis opcionais

- `GENIUS_ACCESS_TOKEN` — melhora o caminho Genius.
- `VAGALUME_API_KEY` — melhora o caminho Vagalume.
- `PROXY_ADMIN_TOKEN` — protege rotas administrativas.
- `CUSTOM_GOSPEL_API_URL` / `CUSTOM_GOSPEL_API_AUTH` — provedor customizado.

Letras.mus.br, Vagalume web e Genius web permanecem com fallbacks sem chave conforme o motor 2.6.

## v2.7 — runtime JavaScript explícito

O artefato de produção v2.7 não depende da transpilação TypeScript do Vercel para os módulos compartilhados. `api/` e `server/` contêm somente `.js` ESM. O código TypeScript de referência está em `source/` e não participa das rotas de Functions.

Isso corrige o erro `ERR_MODULE_NOT_FOUND ... /server/healthHandler.ts` / `proxyRouter.ts` observado no v2.6: nenhum import de runtime aponta para `.ts`.
