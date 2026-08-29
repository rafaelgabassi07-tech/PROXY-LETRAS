import type { ProxyConfig, ProxyPublicConfig } from './types.ts';

export const OFFICIAL_PROXY_BASE_URL = 'https://proxy-letras.vercel.app';

const SECRET_PLACEHOLDER = '••••••••';
const SENSITIVE_HEADER = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key)$/i;

function envList(name: string): string[] {
  return (process.env[name] || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

function envBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value);
}

export const defaultProxyConfig: ProxyConfig = {
  version: '2.4.0',
  serverName: 'Gospel-Lyrics-Proxy-Engine',
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
      enabled: Boolean(process.env.VAGALUME_API_KEY),
      baseUrl: 'https://api.vagalume.com.br',
      apiKey: process.env.VAGALUME_API_KEY || '',
      timeoutMs: 4500,
    },
    genius: {
      enabled: Boolean(process.env.GENIUS_ACCESS_TOKEN),
      baseUrl: 'https://api.genius.com',
      accessToken: process.env.GENIUS_ACCESS_TOKEN || '',
      timeoutMs: 4500,
    },
    letrasMusBr: {
      enabled: true,
      baseUrl: 'https://www.letras.mus.br',
      timeoutMs: 5000,
    },
    customApi: {
      enabled: Boolean(process.env.CUSTOM_GOSPEL_API_URL),
      endpointUrl: process.env.CUSTOM_GOSPEL_API_URL || '',
      authHeader: process.env.CUSTOM_GOSPEL_API_AUTH || '',
      customHeaders: {
        Accept: 'application/json',
        'User-Agent': 'GospelLyricsProxy/2.4',
      },
      method: 'POST',
      responsePath: 'data.lyrics',
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

let currentConfig: ProxyConfig = structuredClone(defaultProxyConfig);

export function getProxyConfig(): ProxyConfig {
  return currentConfig;
}

export function getAdminToken(): string {
  return process.env.PROXY_ADMIN_TOKEN?.trim() || '';
}

function mergeSecret(current: string | undefined, incoming: string | undefined): string | undefined {
  if (incoming === undefined || incoming === '' || incoming === SECRET_PLACEHOLDER) return current;
  if (incoming === '__CLEAR__') return '';
  return incoming;
}

function mergeSensitiveHeaders(
  current: Record<string, string> | undefined,
  incoming: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!incoming) return current;
  const merged = { ...(current || {}) };
  for (const [key, value] of Object.entries(incoming)) {
    if (value === SECRET_PLACEHOLDER || value === '') {
      if (!(key in merged)) merged[key] = value;
      continue;
    }
    if (value === '__CLEAR__') delete merged[key];
    else merged[key] = value;
  }
  return merged;
}

export function updateProxyConfig(newConfig: Partial<ProxyConfig>): ProxyConfig {
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
      genius: {
        ...currentConfig.providers.genius,
        ...(newConfig.providers?.genius || {}),
        accessToken: mergeSecret(currentConfig.providers.genius.accessToken, newConfig.providers?.genius?.accessToken),
      },
      letrasMusBr: {
        ...currentConfig.providers.letrasMusBr,
        ...(newConfig.providers?.letrasMusBr || {}),
      },
      customApi: {
        ...currentConfig.providers.customApi,
        ...(newConfig.providers?.customApi || {}),
        authHeader: mergeSecret(currentConfig.providers.customApi.authHeader, newConfig.providers?.customApi?.authHeader),
        customHeaders: mergeSensitiveHeaders(
          currentConfig.providers.customApi.customHeaders,
          newConfig.providers?.customApi?.customHeaders,
        ),
      },
    },
    filters: {
      ...currentConfig.filters,
      ...(newConfig.filters || {}),
    },
  } as ProxyConfig;
  return currentConfig;
}

export function resetProxyConfig(): ProxyConfig {
  currentConfig = structuredClone(defaultProxyConfig);
  return currentConfig;
}

/**
 * Configuração segura para painel/API. Segredos nunca saem do processo; o painel recebe
 * apenas o indicador `configured` e um placeholder que não sobrescreve o segredo ao salvar.
 */
export function getSafeProxyConfig(): ProxyPublicConfig {
  const config = currentConfig;
  const customHeaders = Object.fromEntries(
    Object.entries(config.providers.customApi.customHeaders || {}).map(([key, value]) => [
      key,
      SENSITIVE_HEADER.test(key) && value ? SECRET_PLACEHOLDER : value,
    ]),
  );

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
        timeoutMs: config.providers.vagalume.timeoutMs,
        configured: Boolean(config.providers.vagalume.apiKey),
        apiKey: config.providers.vagalume.apiKey ? SECRET_PLACEHOLDER : '',
      },
      genius: {
        enabled: config.providers.genius.enabled,
        baseUrl: config.providers.genius.baseUrl,
        timeoutMs: config.providers.genius.timeoutMs,
        configured: Boolean(config.providers.genius.accessToken),
        accessToken: config.providers.genius.accessToken ? SECRET_PLACEHOLDER : '',
      },
      letrasMusBr: { ...config.providers.letrasMusBr },
      customApi: {
        enabled: config.providers.customApi.enabled,
        endpointUrl: config.providers.customApi.endpointUrl,
        method: config.providers.customApi.method,
        responsePath: config.providers.customApi.responsePath,
        configured: Boolean(config.providers.customApi.endpointUrl),
        authHeader: config.providers.customApi.authHeader ? SECRET_PLACEHOLDER : '',
        customHeaders,
      },
    },
    filters: { ...config.filters },
  };
}
