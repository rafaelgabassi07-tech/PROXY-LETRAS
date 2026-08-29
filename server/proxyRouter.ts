/**
 * Router HTTP compartilhado entre Vite e Express.
 * Mantém o contrato usado pelo APK e concentra validação, segurança e observabilidade.
 */

import { timingSafeEqual, randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { GOSPEL_DATABASE } from './gospelDatabase.ts';
import { clearCache, getCacheStats, getGospelSongLyrics, resetProviderHealth, searchGospelSongs } from './lyricsService.ts';
import { OFFICIAL_PROXY_BASE_URL, getAdminToken, getProxyConfig, getSafeProxyConfig, resetProxyConfig, updateProxyConfig } from './proxyConfig.ts';
import { LyricsRequestSchema, ProxyConfigUpdateSchema, RawProxyRequestSchema, SearchQuerySchema, zodIssueMessage } from './schemas.ts';
import { logger } from './logger.ts';
import { EXTRACTION_ENGINE_NAME, EXTRACTION_ENGINE_VERSION, extractionEngineCapabilities } from './extractionEngine.ts';
import type { ProxyTrafficLog, RawProxyRequest } from './types.ts';

const trafficLogs: ProxyTrafficLog[] = [];
const rateBuckets = new Map<string, { minute: number; count: number }>();

function headerValue(headers: Record<string, string>, name: string): string {
  const target = name.toLowerCase();
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === target);
  return entry?.[1] || '';
}

function requestIp(headers: Record<string, string>): string {
  const trusted = headerValue(headers, 'x-proxy-client-ip');
  const forwarded = headerValue(headers, 'x-forwarded-for');
  return (trusted || forwarded.split(',')[0] || 'local').trim().slice(0, 100);
}

function corsHeaders(headers: Record<string, string>): Record<string, string> {
  const config = getProxyConfig();
  const requestedOrigin = headerValue(headers, 'origin');
  const wildcard = config.allowedOrigins.includes('*');
  const origin = !config.enableCors
    ? ''
    : wildcard
      ? '*'
      : requestedOrigin && config.allowedOrigins.includes(requestedOrigin)
        ? requestedOrigin
        : '';
  const result: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Proxy-Admin-Token',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
  if (origin) result['Access-Control-Allow-Origin'] = origin;
  return result;
}

function fallbackRateLimit(headers: Record<string, string>): { allowed: boolean; retryAfter: number; remaining: number } {
  const config = getProxyConfig();
  if (!config.rateLimit.enabled || headerValue(headers, 'x-proxy-rate-limit-applied') === 'true') {
    return { allowed: true, retryAfter: 0, remaining: config.rateLimit.maxRequestsPerMin };
  }
  const minute = Math.floor(Date.now() / 60_000);
  const ip = requestIp(headers);
  const key = `${ip}:${minute}`;
  const bucket = rateBuckets.get(key) || { minute, count: 0 };
  bucket.count += 1;
  rateBuckets.set(key, bucket);

  if (rateBuckets.size > 1000) {
    for (const [entryKey, entry] of rateBuckets.entries()) {
      if (entry.minute < minute - 1) rateBuckets.delete(entryKey);
    }
  }
  const limit = Math.max(10, config.rateLimit.maxRequestsPerMin);
  return {
    allowed: bucket.count <= limit,
    retryAfter: Math.max(1, 60 - Math.floor((Date.now() % 60_000) / 1000)),
    remaining: Math.max(0, limit - bucket.count),
  };
}

function truncateLogValue(value: unknown, max = 600): string | undefined {
  if (value == null) return undefined;
  try {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return text.length > max ? `${text.slice(0, max)}…` : text;
  } catch {
    return undefined;
  }
}

function safeSecretEqual(expected: string, supplied: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  if (expectedBuffer.length !== suppliedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, suppliedBuffer);
}

function normalizeIp(ip: string): string {
  return ip.replace(/^::ffff:/i, '').replace(/^\[|\]$/g, '').trim().toLowerCase();
}

function isLoopback(ip: string): boolean {
  const normalized = normalizeIp(ip);
  return normalized === 'local' || normalized === 'localhost' || normalized === '::1' || normalized === '127.0.0.1' || normalized.startsWith('127.');
}

function adminAuthorized(headers: Record<string, string>): boolean {
  const configuredToken = getAdminToken();
  const supplied = headerValue(headers, 'x-proxy-admin-token') || headerValue(headers, 'authorization').replace(/^Bearer\s+/i, '');
  if (configuredToken) return Boolean(supplied) && safeSecretEqual(configuredToken, supplied);
  const config = getProxyConfig();
  return config.security.allowLocalAdminWithoutToken && isLoopback(requestIp(headers));
}

function isAdminPath(pathname: string): boolean {
  return pathname === '/api/proxy/lyrics/raw' ||
    pathname === '/api/proxy/config' ||
    pathname === '/api/proxy/config/reset' ||
    pathname === '/api/proxy/logs' ||
    pathname === '/api/proxy/logs/clear' ||
    pathname === '/api/proxy/cache/clear';
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224;
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (/^fe[89ab]/.test(normalized)) return true;
  if (normalized.startsWith('ff')) return true;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isPrivateIpv4(mapped[1]) : false;
}

function isPrivateIp(ip: string): boolean {
  const normalized = normalizeIp(ip);
  const version = isIP(normalized);
  if (version === 4) return isPrivateIpv4(normalized);
  if (version === 6) return isPrivateIpv6(normalized);
  return true;
}

function hostAllowed(host: string, allowlist: string[]): boolean {
  const normalized = host.toLowerCase().replace(/\.$/, '');
  return allowlist.some(value => {
    const allowed = value.toLowerCase().replace(/^\*\./, '').replace(/\.$/, '');
    return normalized === allowed || normalized.endsWith(`.${allowed}`);
  });
}

async function validateRawTarget(raw: string): Promise<URL> {
  const config = getProxyConfig();
  const target = new URL(raw);
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Apenas HTTP/HTTPS é permitido');
  if (target.username || target.password) throw new Error('Credenciais embutidas na URL não são permitidas');
  const host = target.hostname.toLowerCase().replace(/\.$/, '');
  if (!config.security.rawProxyAllowedHosts.length || !hostAllowed(host, config.security.rawProxyAllowedHosts)) {
    throw new Error('Host não está na allowlist do proxy raw');
  }
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || host === 'metadata.google.internal') {
    throw new Error('Destino local/privado bloqueado');
  }

  if (isIP(host)) {
    if (isPrivateIp(host)) throw new Error('Destino local/privado bloqueado');
    return target;
  }

  const addresses = await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(entry => isPrivateIp(entry.address))) {
    throw new Error('DNS resolveu para endereço local/privado');
  }
  return target;
}

const SAFE_RAW_HEADERS = new Set([
  'accept', 'accept-language', 'content-type', 'user-agent', 'x-api-key', 'x-requested-with',
]);

function sanitizeRawHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  const sanitized: Record<string, string> = {
    'User-Agent': 'GospelLyricsProxy/2.4',
    Accept: '*/*',
  };
  for (const [key, value] of Object.entries(headers || {})) {
    if (!SAFE_RAW_HEADERS.has(key.toLowerCase())) continue;
    sanitized[key] = String(value).slice(0, 4000);
  }
  return sanitized;
}

async function fetchRawSafely(rawReq: RawProxyRequest): Promise<{ response: Response; target: URL }> {
  let target = await validateRawTarget(rawReq.targetUrl);
  for (const [key, value] of Object.entries(rawReq.queryParams || {})) target.searchParams.append(key, String(value));

  let method = rawReq.method || 'GET';
  let body = ['POST', 'PUT', 'PATCH'].includes(method) && rawReq.body != null
    ? (typeof rawReq.body === 'string' ? rawReq.body : JSON.stringify(rawReq.body))
    : undefined;
  const headers = sanitizeRawHeaders(rawReq.headers);
  if (body && !Object.keys(headers).some(key => key.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json';

  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetch(target, {
      method,
      headers,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(rawReq.timeoutMs || 8000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error(`Redirecionamento HTTP ${response.status} sem destino`);
      target = await validateRawTarget(new URL(location, target).toString());
      if (response.status === 303) {
        method = 'GET';
        body = undefined;
      }
      continue;
    }
    return { response, target };
  }
  throw new Error('Número máximo de redirecionamentos excedido');
}

export function recordLog(log: Omit<ProxyTrafficLog, 'id' | 'timestamp'>) {
  const newLog: ProxyTrafficLog = {
    ...log,
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
  };
  trafficLogs.unshift(newLog);
  if (trafficLogs.length > 100) trafficLogs.length = 100;
  logger.info({
    requestId: newLog.requestId,
    method: newLog.method,
    path: newLog.path,
    provider: newLog.targetProvider,
    status: newLog.status,
    latencyMs: newLog.latencyMs,
    cached: newLog.cached,
    extractionMethod: newLog.extractionMethod,
    error: newLog.error,
  }, 'proxy_request');
  return newLog;
}

export function getTrafficLogs(): ProxyTrafficLog[] {
  return trafficLogs;
}

export function clearTrafficLogs(): void {
  trafficLogs.length = 0;
}

export async function handleApiRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<{ status: number; headers: Record<string, string>; body: any }> {
  const startTime = Date.now();
  const parsedUrl = new URL(url, 'http://localhost:3000');
  const pathname = parsedUrl.pathname;
  const responseHeaders = corsHeaders(headers);
  const normalizedMethod = method.toUpperCase();
  const requestId = headerValue(headers, 'x-request-id') || randomUUID();
  responseHeaders['X-Request-Id'] = requestId;

  if (normalizedMethod === 'OPTIONS') return { status: 204, headers: responseHeaders, body: null };

  const limit = fallbackRateLimit(headers);
  if (!limit.allowed) {
    responseHeaders['Retry-After'] = String(limit.retryAfter);
    return {
      status: 429,
      headers: responseHeaders,
      body: { success: false, code: 'RATE_LIMITED', error: 'Muitas requisições. Tente novamente em instantes.', retryAfterSeconds: limit.retryAfter },
    };
  }

  if (isAdminPath(pathname) && !adminAuthorized(headers)) {
    return {
      status: 401,
      headers: responseHeaders,
      body: { success: false, code: 'ADMIN_REQUIRED', error: 'Autorização administrativa necessária.' },
    };
  }

  try {
    if (pathname === '/api/health' || pathname === '/api/proxy/health') {
      const config = getProxyConfig();
      const latency = Date.now() - startTime;
      recordLog({ method: normalizedMethod, path: pathname, targetProvider: 'internal', status: 200, latencyMs: latency, ip: requestIp(headers), requestId });
      return {
        status: 200,
        headers: responseHeaders,
        body: {
          status: 'online',
          service: config.serverName,
          version: config.version,
          deployment: process.env.VERCEL ? 'vercel' : 'local',
          publicBaseUrl: process.env.PUBLIC_PROXY_URL?.trim() || (process.env.VERCEL ? OFFICIAL_PROXY_BASE_URL : undefined),
          uptimeSeconds: Math.floor(process.uptime?.() || 0),
          cache: getCacheStats(),
          defaultProvider: config.defaultProvider,
          activeProviders: [
            'database',
            ...(config.providers.letrasMusBr.enabled ? ['letras_mus_br'] : []),
            ...(config.providers.vagalume.enabled ? ['vagalume'] : []),
            ...(config.providers.genius.enabled ? ['genius'] : []),
            ...(config.providers.customApi.enabled && config.providers.customApi.endpointUrl ? ['customApi'] : []),
          ],
          providerModes: {
            database: 'local',
            letrasMusBr: config.providers.letrasMusBr.enabled ? 'web-glx' : 'disabled',
            vagalume: config.providers.vagalume.enabled
              ? (config.providers.vagalume.apiKey ? 'api+web-glx-fallback' : 'web-glx')
              : 'disabled',
            genius: config.providers.genius.enabled
              ? (config.providers.genius.accessToken ? 'api+web-glx-fallback' : 'web-search+glx')
              : 'disabled',
            customApi: config.providers.customApi.enabled && config.providers.customApi.endpointUrl ? 'custom-api' : 'disabled',
          },
          scraperEngine: {
            name: EXTRACTION_ENGINE_NAME,
            version: EXTRACTION_ENGINE_VERSION,
            parsers: ['parse5', 'htmlparser2', 'structured-json', 'heuristic'],
          },
          capabilities: [
            'multi-provider-search',
            ...extractionEngineCapabilities(),
            'bounded-stream-fetch',
            'retry-backoff-jitter',
            'redirect-host-validation',
            'lru-cache',
            'zod-validation',
            'exact-source-retrieval',
            'credentialless-web-fallbacks',
            'request-id',
          ],
          security: {
            rawProxyEnabled: config.security.rawProxyEnabled,
            adminAuthConfigured: Boolean(getAdminToken()),
          },
          timestamp: new Date().toISOString(),
        },
      };
    }

    if (pathname === '/api/proxy/lyrics/search' && normalizedMethod === 'POST') {
      const input = body && typeof body === 'object' ? body : {};
      const parsed = SearchQuerySchema.safeParse(input);
      if (!parsed.success) {
        return { status: 400, headers: responseHeaders, body: { success: false, code: 'VALIDATION_ERROR', error: zodIssueMessage(parsed.error) } };
      }
      const queryParams = { ...parsed.data };
      const hasInput = [queryParams.query, queryParams.artist, queryParams.title, queryParams.theme].some(value => value.trim());
      if (!hasInput) {
        queryParams.provider = 'built-in';
        queryParams.limit = Math.min(queryParams.limit, 12);
      }
      const result = await searchGospelSongs(queryParams);
      const latency = Date.now() - startTime;
      recordLog({
        method: normalizedMethod,
        path: pathname,
        targetProvider: result.provider,
        status: 200,
        latencyMs: latency,
        ip: requestIp(headers),
        requestId,
        queryParam: truncateLogValue({ ...queryParams }),
        cached: result.cached,
      });
      return {
        status: 200,
        headers: responseHeaders,
        body: { success: true, query: queryParams, count: result.total, provider: result.provider, cached: result.cached, latencyMs: latency, data: result.results },
      };
    }

    if (pathname === '/api/proxy/lyrics/get' && normalizedMethod === 'POST') {
      const parsed = LyricsRequestSchema.safeParse(body && typeof body === 'object' ? body : {});
      if (!parsed.success) {
        return { status: 400, headers: responseHeaders, body: { success: false, code: 'VALIDATION_ERROR', error: zodIssueMessage(parsed.error) } };
      }
      const params = parsed.data;
      const result = await getGospelSongLyrics(params);
      const latency = Date.now() - startTime;
      const status = result.song ? 200 : 404;
      recordLog({
        method: normalizedMethod,
        path: pathname,
        targetProvider: result.provider,
        status,
        latencyMs: latency,
        ip: requestIp(headers),
        requestId,
        queryParam: truncateLogValue({ id: params.id, artist: params.artist, title: params.title, provider: params.provider }),
        cached: result.cached,
        extractionMethod: result.song?.extractionMethod,
      });
      return result.song
        ? { status: 200, headers: responseHeaders, body: { success: true, provider: result.provider, cached: result.cached, latencyMs: latency, data: result.song } }
        : { status: 404, headers: responseHeaders, body: { success: false, code: 'LYRICS_NOT_FOUND', message: 'Letra não encontrada nas fontes disponíveis.', provider: result.provider, latencyMs: latency } };
    }

    if (pathname === '/api/proxy/lyrics/raw' && normalizedMethod === 'POST') {
      const config = getProxyConfig();
      if (!config.security.rawProxyEnabled) {
        return { status: 403, headers: responseHeaders, body: { success: false, code: 'RAW_PROXY_DISABLED', error: 'Proxy raw desativado por segurança.' } };
      }
      const parsed = RawProxyRequestSchema.safeParse(body && typeof body === 'object' ? body : {});
      if (!parsed.success) {
        return { status: 400, headers: responseHeaders, body: { success: false, code: 'VALIDATION_ERROR', error: zodIssueMessage(parsed.error) } };
      }
      const rawReq = parsed.data as RawProxyRequest;
      try {
        const { response: externalRes, target } = await fetchRawSafely(rawReq);
        const contentType = externalRes.headers.get('content-type') || '';
        const rawText = await externalRes.text();
        if (rawText.length > 1_500_000) throw new Error('Resposta externa excede o limite permitido');
        let responseData: unknown = rawText;
        if (contentType.includes('application/json')) {
          try { responseData = JSON.parse(rawText); } catch { /* mantém texto */ }
        }
        const latency = Date.now() - startTime;
        recordLog({ method: rawReq.method, path: '/raw', targetProvider: 'external-raw', status: externalRes.status, latencyMs: latency, ip: requestIp(headers), requestId });
        return { status: externalRes.status, headers: responseHeaders, body: { success: externalRes.ok, status: externalRes.status, targetUrl: target.toString(), latencyMs: latency, data: responseData } };
      } catch (error: any) {
        const latency = Date.now() - startTime;
        recordLog({ method: rawReq.method, path: '/raw', targetProvider: 'external-raw', status: 502, latencyMs: latency, ip: requestIp(headers), requestId, error: error?.message });
        return { status: 502, headers: responseHeaders, body: { success: false, code: 'RAW_PROXY_FAILED', error: `Falha no proxy externo: ${error?.message || 'erro desconhecido'}` } };
      }
    }

    if (pathname === '/api/proxy/config' && normalizedMethod === 'GET') {
      return { status: 200, headers: responseHeaders, body: { success: true, config: getSafeProxyConfig() } };
    }
    if (pathname === '/api/proxy/config' && normalizedMethod === 'POST') {
      const parsed = ProxyConfigUpdateSchema.safeParse(body && typeof body === 'object' ? body : {});
      if (!parsed.success) {
        return { status: 400, headers: responseHeaders, body: { success: false, code: 'VALIDATION_ERROR', error: zodIssueMessage(parsed.error) } };
      }
      updateProxyConfig(parsed.data as any);
      clearCache();
      resetProviderHealth();
      return { status: 200, headers: responseHeaders, body: { success: true, message: 'Configuração atualizada e cache invalidado.', config: getSafeProxyConfig() } };
    }
    if (pathname === '/api/proxy/config/reset' && normalizedMethod === 'POST') {
      resetProxyConfig();
      clearCache();
      resetProviderHealth();
      return { status: 200, headers: responseHeaders, body: { success: true, message: 'Configuração redefinida e cache invalidado.', config: getSafeProxyConfig() } };
    }

    if (pathname === '/api/proxy/samples' && normalizedMethod === 'GET') {
      return {
        status: 200,
        headers: responseHeaders,
        body: {
          success: true,
          count: GOSPEL_DATABASE.length,
          samples: GOSPEL_DATABASE.map(song => ({ id: song.id, title: song.title, artist: song.artist, album: song.album, theme: song.theme, key: song.key })),
        },
      };
    }

    if (pathname === '/api/proxy/logs' && normalizedMethod === 'GET') {
      return { status: 200, headers: responseHeaders, body: { success: true, logs: getTrafficLogs() } };
    }
    if (pathname === '/api/proxy/logs/clear' && normalizedMethod === 'POST') {
      clearTrafficLogs();
      return { status: 200, headers: responseHeaders, body: { success: true, message: 'Logs limpos.' } };
    }
    if (pathname === '/api/proxy/cache/clear' && normalizedMethod === 'POST') {
      clearCache();
      return { status: 200, headers: responseHeaders, body: { success: true, message: 'Cache limpo.' } };
    }

    return {
      status: 404,
      headers: responseHeaders,
      body: {
        success: false,
        code: 'ENDPOINT_NOT_FOUND',
        error: `Endpoint não encontrado: ${normalizedMethod} ${pathname}`,
        availableEndpoints: [
          'GET /api/health',
          'POST /api/proxy/lyrics/search',
          'POST /api/proxy/lyrics/get',
          'GET /api/proxy/samples',
        ],
      },
    };
  } catch (error: any) {
    const latency = Date.now() - startTime;
    recordLog({ method: normalizedMethod, path: pathname, targetProvider: 'internal', status: 500, latencyMs: latency, ip: requestIp(headers), requestId, error: error?.message });
    return { status: 500, headers: responseHeaders, body: { success: false, code: 'INTERNAL_ERROR', error: 'Erro interno no servidor proxy' } };
  }
}
