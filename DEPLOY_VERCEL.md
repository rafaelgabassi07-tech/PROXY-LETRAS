# Deploy no Vercel — Gospel Lyrics Proxy 2.4.1

## Estrutura esperada na raiz

- `server.ts`
- `package.json`
- `vercel.json`
- `server/`

## Configuração

O Vercel moderno detecta o Express automaticamente pelo `server.ts` exportado como `default`.
Não declare `server.ts` no bloco `functions`.

`vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "express"
}
```

Depois do deploy, valide:

- `GET /api/health`
- `POST /api/proxy/lyrics/search`
- `POST /api/proxy/lyrics/get`

O APK usa por padrão `https://proxy-letras.vercel.app` e consulta `/api/health`.
