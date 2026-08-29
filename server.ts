/** Servidor Express 5 de produção do Gospel Lyrics Proxy Hub. */
import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { handleApiRequest } from './server/proxyRouter.ts';
import { getProxyConfig } from './server/proxyConfig.ts';
import { logger } from './server/logger.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || getProxyConfig().port || 3000);

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'same-origin' },
  referrerPolicy: { policy: 'no-referrer' },
}));
app.use(express.json({ limit: '256kb', strict: true }));
app.use(express.urlencoded({ extended: false, limit: '128kb' }));

const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: () => Math.max(10, getProxyConfig().rateLimit.maxRequestsPerMin),
  skip: () => !getProxyConfig().rateLimit.enabled,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, code: 'RATE_LIMITED', error: 'Muitas requisições. Tente novamente em instantes.' },
});

app.use('/api', apiLimiter, async (req, res) => {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers[key] = value;
    else if (Array.isArray(value)) headers[key] = value.join(', ');
  }
  // `req.ip` respeita trust proxy; o router prioriza este valor interno em vez de
  // confiar diretamente num X-Forwarded-For arbitrário.
  headers['x-proxy-client-ip'] = String(req.ip || req.socket.remoteAddress || 'local');
  headers['x-proxy-rate-limit-applied'] = 'true';

  const result = await handleApiRequest(req.originalUrl, req.method, headers, req.body);
  for (const [key, value] of Object.entries(result.headers)) res.setHeader(key, value);
  if (result.body === null) res.status(result.status).end();
  else res.status(result.status).send(result.body);
});

const distPath = path.resolve(__dirname, 'dist');
const indexPath = path.join(distPath, 'index.html');
app.use(express.static(distPath, { maxAge: '1h', etag: true, fallthrough: true }));
app.use((_req, res) => {
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  return res.status(200).json({
    status: 'online',
    service: getProxyConfig().serverName,
    version: getProxyConfig().version,
    message: 'API ativa. Execute npm run build para disponibilizar o painel web.',
  });
});

app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ error: error?.message }, 'express_error');
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ success: false, code: 'PAYLOAD_TOO_LARGE', error: 'Payload excede o limite permitido.' });
  }
  return res.status(400).json({ success: false, code: 'BAD_REQUEST', error: 'Requisição inválida.' });
});

// Vercel detecta e executa o Express exportado como uma única Function/Fluid Compute.
// Fora do Vercel preservamos o listener tradicional para `npm start` e desenvolvimento local.
if (!process.env.VERCEL) {
  const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info({ version: getProxyConfig().version, port: PORT }, 'proxy_started');
  });

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      logger.info({ signal }, 'proxy_stopping');
      server.close(() => process.exit(0));
    });
  }
}

export default app;
