import { PROXY_SERVER_NAME, PROXY_VERSION } from './meta.js';
export const OFFICIAL_PROXY_BASE_URL = 'https://proxy-letras.vercel.app';
const SECRET_PLACEHOLDER = '••••••••';
function envList(name) {
    return (process.env[name] || '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
}
function envBoolean(name, fallback) {
    const value = process.env[name]?.trim().toLowerCase();
    if (!value)
        return fallback;
    return ['1', 'true', 'yes', 'on'].includes(value);
}
export const defaultProxyConfig = {
    version: PROXY_VERSION,
    serverName: PROXY_SERVER_NAME,
    port: Number(process.env.PORT || 3000),
    enableCors: true,
    allowedOrigins: (process.env.ALLOWED_ORIGINS || (process.env.VERCEL ? OFFICIAL_PROXY_BASE_URL : '*'))
        .split(',')
        .map(value => value.trim())
        .filter(Boolean),
    rateLimit: {
        enabled: true,
        maxRequestsPerMin: 90,
    },
    cache: {
        enabled: true,
        // Mantido por compatibilidade com o painel/configurações da versão 2.0.
        ttlSeconds: 6 * 60 * 60,
        searchTtlSeconds: 60 * 60,
        lyricsTtlSeconds: 24 * 60 * 60,
        maxEntries: 500,
    },
    security: {
        rawProxyEnabled: envBoolean('RAW_PROXY_ENABLED', false),
        rawProxyAllowedHosts: envList('RAW_PROXY_ALLOWED_HOSTS'),
        allowLocalAdminWithoutToken: envBoolean('ALLOW_LOCAL_ADMIN_WITHOUT_TOKEN', true),
    },
    defaultProvider: 'multi-provider',
    providers: {
        vagalume: {
            // O site web funciona sem credencial; a API oficial é usada quando há chave.
            enabled: true,
            baseUrl: 'https://api.vagalume.com.br',
            webBaseUrl: 'https://www.vagalume.com.br',
            apiKey: process.env.VAGALUME_API_KEY || '',
            timeoutMs: 4500,
        },
        lrclib: {
            // Índice JSON moderno para descoberta por título/artista/álbum; não exige chave.
            enabled: true,
            baseUrl: 'https://lrclib.net',
            timeoutMs: 4200,
        },
    },
    filters: {
        // O filtro semântico fica desligado para não eliminar falsos negativos. A aba Letras
        // é dedicada a gospel, mas a relevância final é determinada pelo usuário.
        onlyGospel: false,
        cleanHTML: true,
        autoTagThemes: true,
        formatVerses: true,
    },
};
let currentConfig = structuredClone(defaultProxyConfig);
export function getProxyConfig() {
    return currentConfig;
}
export function getAdminToken() {
    return process.env.PROXY_ADMIN_TOKEN?.trim() || '';
}
function mergeSecret(current, incoming) {
    if (incoming === undefined || incoming === '' || incoming === SECRET_PLACEHOLDER)
        return current;
    if (incoming === '__CLEAR__')
        return '';
    return incoming;
}
export function updateProxyConfig(newConfig) {
    currentConfig = {
        ...currentConfig,
        ...newConfig,
        // identidade/runtime não podem ser sobrescritos por uma chamada HTTP de configuração.
        version: currentConfig.version,
        serverName: currentConfig.serverName,
        port: currentConfig.port,
        rateLimit: {
            ...currentConfig.rateLimit,
            ...(newConfig.rateLimit || {}),
        },
        cache: {
            ...currentConfig.cache,
            ...(newConfig.cache || {}),
        },
        security: {
            ...currentConfig.security,
            ...(newConfig.security || {}),
        },
        providers: {
            ...currentConfig.providers,
            ...(newConfig.providers || {}),
            vagalume: {
                ...currentConfig.providers.vagalume,
                ...(newConfig.providers?.vagalume || {}),
                apiKey: mergeSecret(currentConfig.providers.vagalume.apiKey, newConfig.providers?.vagalume?.apiKey),
            },
            lrclib: {
                ...currentConfig.providers.lrclib,
                ...(newConfig.providers?.lrclib || {}),
            },
        },
        filters: {
            ...currentConfig.filters,
            ...(newConfig.filters || {}),
        },
    };
    return currentConfig;
}
export function resetProxyConfig() {
    currentConfig = structuredClone(defaultProxyConfig);
    return currentConfig;
}
/**
 * Configuração segura para painel/API. Segredos nunca saem do processo; o painel recebe
 * apenas o indicador `configured` e um placeholder que não sobrescreve o segredo ao salvar.
 */
export function getSafeProxyConfig() {
    const config = currentConfig;
    return {
        version: config.version,
        serverName: config.serverName,
        port: config.port,
        enableCors: config.enableCors,
        allowedOrigins: [...config.allowedOrigins],
        rateLimit: { ...config.rateLimit },
        cache: { ...config.cache },
        security: {
            rawProxyEnabled: config.security.rawProxyEnabled,
            rawProxyAllowedHosts: [...config.security.rawProxyAllowedHosts],
            adminAuthConfigured: Boolean(getAdminToken()),
            localAdminAllowed: config.security.allowLocalAdminWithoutToken,
        },
        defaultProvider: config.defaultProvider,
        providers: {
            vagalume: {
                enabled: config.providers.vagalume.enabled,
                baseUrl: config.providers.vagalume.baseUrl,
                webBaseUrl: config.providers.vagalume.webBaseUrl,
                timeoutMs: config.providers.vagalume.timeoutMs,
                configured: Boolean(config.providers.vagalume.apiKey),
                apiKey: config.providers.vagalume.apiKey ? SECRET_PLACEHOLDER : '',
            },
            lrclib: { ...config.providers.lrclib },
        },
        filters: { ...config.filters },
    };
}
