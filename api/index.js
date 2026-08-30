import { healthFetch } from '../server/healthHandler.js';
import { PROXY_VERSION } from '../server/meta.js';

const ROUTE_PARAM = '__glx_path';
let adapterPromise;

function adapterModule() {
  if (!adapterPromise) adapterPromise = import('../server/vercelAdapter.js');
  return adapterPromise;
}

function logEdgeEntry(request, pathname) {
  // Log antes do parse do body/import pesado. Se o runtime travar no bootstrap, o Vercel ainda
  // registra que a requisição realmente chegou à Function. Não inclui consulta nem payload.
  console.info(JSON.stringify({
    level: 30,
    time: Date.now(),
    service: 'gospel-lyrics-proxy',
    method: request.method,
    path: pathname,
    msg: 'proxy_edge_entry'
  }));
}

function originalPath(request) {
  const url = new URL(request.url);
  const explicit = url.searchParams.get(ROUTE_PARAM);
  if (explicit) return explicit;
  return url.pathname === '/api/index' ? '/api/health' : url.pathname;
}

function withOriginalPath(request, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  url.searchParams.delete(ROUTE_PARAM);
  return new Request(url, request);
}

export default {
  async fetch(request) {
    const pathname = originalPath(request);
    logEdgeEntry(request, pathname);
    const routedRequest = withOriginalPath(request, pathname);

    if (pathname === '/api/health' || pathname === '/api/proxy/health') {
      return healthFetch(routedRequest);
    }

    try {
      const { dispatchVercelRequest } = await adapterModule();
      return await dispatchVercelRequest(routedRequest);
    } catch (error) {
      return Response.json({
        success: false,
        code: 'RUNTIME_BOOT_FAILED',
        error: 'O runtime do motor de letras não conseguiu inicializar.',
        diagnostic: String(error?.message || error?.name || 'runtime-import-failed').slice(0, 300),
        version: PROXY_VERSION
      }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
  }
};
