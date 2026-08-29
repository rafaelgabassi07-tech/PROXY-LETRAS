import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dispatchVercelRequest } from './server/vercelAdapter.ts';
import { PROXY_VERSION } from './server/meta.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const indexPath = path.join(__dirname, 'index.html');

const server = http.createServer(async (req, res) => {
  try {
    if ((req.url || '/').startsWith('/api/')) {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks);
      const url = `http://${req.headers.host || `localhost:${port}`}${req.url || '/'}`;
      const request = new Request(url, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        body: ['GET', 'HEAD'].includes(req.method || 'GET') ? undefined : body,
      });
      const response = await dispatchVercelRequest(request);
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(fs.readFileSync(indexPath));
  } catch (error: any) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ success: false, error: error?.message || 'Erro interno' }));
  }
});

server.listen(port, '0.0.0.0', () => console.log(`Gospel Lyrics Proxy ${PROXY_VERSION} em http://localhost:${port}`));
