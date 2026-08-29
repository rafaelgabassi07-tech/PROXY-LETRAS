import { getAdminToken, getProxyConfig, OFFICIAL_PROXY_BASE_URL } from './proxyConfig.js';
import { EXTRACTION_ENGINE_NAME, EXTRACTION_ENGINE_VERSION, GLX_CAPABILITIES } from './meta.js';
function corsHeaders(request) {
    const headers = new Headers({
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        Vary: 'Origin',
    });
    const config = getProxyConfig();
    const origin = request.headers.get('origin') || '';
    if (config.enableCors) {
        if (config.allowedOrigins.includes('*'))
            headers.set('Access-Control-Allow-Origin', '*');
        else if (origin && config.allowedOrigins.includes(origin))
            headers.set('Access-Control-Allow-Origin', origin);
    }
    return headers;
}
async function runtimeProbe() {
    try {
        // Import dinâmico: o health permanece disponível mesmo se o motor pesado falhar
        // durante a inicialização em um runtime específico.
        const module = await import('./lyricsService.js');
        if (typeof module.searchGospelSongs !== 'function' || typeof module.getGospelSongLyrics !== 'function') {
            return { ready: false, diagnostic: 'lyrics-service-contract-missing' };
        }
        return { ready: true };
    }
    catch (error) {
        return { ready: false, diagnostic: String(error?.message || error?.name || 'runtime-import-failed').slice(0, 240) };
    }
}
export async function healthFetch(request) {
    const headers = corsHeaders(request);
    if (request.method === 'OPTIONS')
        return new Response(null, { status: 204, headers });
    if (request.method !== 'GET')
        return Response.json({ status: 'error', code: 'METHOD_NOT_ALLOWED' }, { status: 405, headers });
    const config = getProxyConfig();
    const probe = await runtimeProbe();
    const body = {
        status: 'online',
        apiReady: probe.ready,
        service: config.serverName,
        version: config.version,
        deployment: 'vercel-function',
        publicBaseUrl: process.env.PUBLIC_PROXY_URL?.trim() || OFFICIAL_PROXY_BASE_URL,
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
            vagalume: config.providers.vagalume.enabled ? (config.providers.vagalume.apiKey ? 'api+web-glx-fallback' : 'web-glx') : 'disabled',
            genius: config.providers.genius.enabled ? (config.providers.genius.accessToken ? 'api+web-glx-fallback' : 'web-search+glx') : 'disabled',
            customApi: config.providers.customApi.enabled && config.providers.customApi.endpointUrl ? 'custom-api' : 'disabled',
        },
        scraperEngine: {
            name: EXTRACTION_ENGINE_NAME,
            version: EXTRACTION_ENGINE_VERSION,
            parsers: ['parse5', 'htmlparser2', 'structured-json', 'heuristic'],
        },
        capabilities: [
            'vercel-native-functions',
            'lightweight-health-probe',
            'multi-provider-search',
            ...GLX_CAPABILITIES,
            'bounded-stream-fetch',
            'retry-backoff-jitter',
            'redirect-host-validation',
            'lru-cache',
            'zod-validation',
            'exact-source-retrieval',
            'credentialless-web-fallbacks',
        ],
        runtime: {
            node: process.version,
            lyricsServiceReady: probe.ready,
            diagnostic: probe.diagnostic,
        },
        security: {
            rawProxyEnabled: config.security.rawProxyEnabled,
            adminAuthConfigured: Boolean(getAdminToken()),
        },
        timestamp: new Date().toISOString(),
    };
    return new Response(JSON.stringify(body), { status: 200, headers });
}
export const vercelHealthHandler = { fetch: healthFetch };
