import { handleApiRequest } from './proxyRouter.js';

const MAX_JSON_BODY_BYTES = 256 * 1024;

function requestHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => { headers[key] = value; });
  // Marca que a limitação é feita pelo router compartilhado; não existe middleware
  // Express no runtime Vercel.
  headers['x-proxy-rate-limit-applied'] = 'false';
  return headers;
}

async function parseRequestBody(request: Request): Promise<unknown> {
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return undefined;
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BODY_BYTES) {
    throw Object.assign(new Error('Payload excede o limite permitido.'), { statusCode: 413 });
  }
  const text = await request.text();
  if (!text) return undefined;
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_BODY_BYTES) {
    throw Object.assign(new Error('Payload excede o limite permitido.'), { statusCode: 413 });
  }
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) return text;
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error('JSON inválido.'), { statusCode: 400 });
  }
}

function responseFromRouter(result: { status: number; headers: Record<string, string>; body: any }): Response {
  const headers = new Headers(result.headers);
  let body: BodyInit | null = null;
  if (result.body !== null && result.body !== undefined) {
    if (typeof result.body === 'string') body = result.body;
    else {
      if (!headers.has('content-type')) headers.set('content-type', 'application/json; charset=utf-8');
      body = JSON.stringify(result.body);
    }
  }
  return new Response(body, { status: result.status, headers });
}

export async function dispatchVercelRequest(request: Request): Promise<Response> {
  try {
    const body = await parseRequestBody(request);
    const url = new URL(request.url);
    const result = await handleApiRequest(`${url.pathname}${url.search}`, request.method, requestHeaders(request), body);
    return responseFromRouter(result);
  } catch (error: any) {
    const status = Number(error?.statusCode) || 500;
    return Response.json(
      {
        success: false,
        code: status === 413 ? 'PAYLOAD_TOO_LARGE' : status === 400 ? 'BAD_REQUEST' : 'FUNCTION_ERROR',
        error: status >= 500 ? 'Falha interna na Function do Proxy.' : String(error?.message || 'Requisição inválida.'),
      },
      { status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

export const vercelRouterHandler = { fetch: dispatchVercelRequest } as const;
