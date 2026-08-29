import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, Plugin } from 'vite';
import { handleApiRequest } from '../server/proxyRouter.ts';

function gospelProxyApiPlugin(): Plugin {
  return {
    name: 'gospel-proxy-api-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api')) {
          return next();
        }

        let body: any = null;
        if (['POST', 'PUT', 'PATCH'].includes(req.method || '')) {
          const chunks: any[] = [];
          for await (const chunk of req) {
            chunks.push(chunk);
          }
          const raw = Buffer.concat(chunks).toString('utf-8');
          try {
            body = raw ? JSON.parse(raw) : null;
          } catch {
            body = raw;
          }
        }

        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(req.headers)) {
          if (typeof v === 'string') headers[k] = v;
          else if (Array.isArray(v)) headers[k] = v.join(', ');
        }

        const result = await handleApiRequest(
          req.url,
          req.method || 'GET',
          headers,
          body
        );

        res.statusCode = result.status;
        for (const [k, v] of Object.entries(result.headers)) {
          res.setHeader(k, v);
        }

        if (result.body === null) {
          res.end();
        } else if (typeof result.body === 'string') {
          res.end(result.body);
        } else {
          res.end(JSON.stringify(result.body));
        }
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), gospelProxyApiPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      outDir: '../dist',
      emptyOutDir: true,
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
