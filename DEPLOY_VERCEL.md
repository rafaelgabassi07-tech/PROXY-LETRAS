# Deploy no Vercel — Gospel Lyrics Proxy 2.5.0

## Backend Express zero-config

A raiz do projeto de deploy contém apenas o backend detectável pelo Vercel:

- `server.ts` — importa Express e `export default app`
- `package.json` — dependências de produção exclusivamente do backend
- `server/`
- `scripts/verify-vercel-config.mjs`

**Não existe `vercel.json` e não existe script genérico `build`.** Isso é intencional: o Vercel atual detecta o Express pelo entrypoint e pelas dependências. Um `functions.server.ts` ou rewrites para `/api` não devem ser adicionados.

O dashboard Vite/React foi isolado em `web/` e não participa da detecção/build do backend. Para usá-lo localmente:

```bash
npm install
npm --prefix web install
npm run web:dev
```

Para gerar o painel estático opcional em `dist/`:

```bash
npm run web:build
```

## Validação obrigatória antes do deploy

```bash
npm run test:deploy
npm run lint
npm run test:proxy
```

Depois do deploy no domínio oficial, valide na ordem:

1. `GET /api/health`
2. `GET /api/proxy/health` (alias de compatibilidade)
3. `POST /api/proxy/lyrics/search`
4. `POST /api/proxy/lyrics/get`

O APK usa por padrão `https://proxy-letras.vercel.app` e tenta os dois endpoints de health antes de classificar a API como indisponível.
