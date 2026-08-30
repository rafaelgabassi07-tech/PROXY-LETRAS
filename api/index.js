import { healthFetch } from '../server/healthHandler.js';
import { PROXY_VERSION } from '../server/meta.js';

const ROUTE_PARAM = '__glx_path';

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
    const routedRequest = withOriginalPath(request, pathname);

    if (pathname === '/api/health' || pathname === '/api/proxy/health') {
      return healthFetch(routedRequest);
    }

    try {
      const { dispatchVercelRequest } = await import('../server/vercelAdapter.js');
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
