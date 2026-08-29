/**
 * Contratos públicos do Gospel Lyrics Proxy.
 * Mantêm compatibilidade com o APK e explicitam capacidades modernas do motor.
 */

export type LyricsSource =
  | 'database'
  | 'vagalume'
  | 'genius'
  | 'letras_mus_br'
  | 'custom_api';

export type LyricsExtractionMethod =
  | 'database'
  | 'api'
  | 'cheerio-dom'
  | 'dom-semantic'
  | 'dom-density'
  | 'dom-readability'
  | 'dom-cluster'
  | 'baseline-rescue'
  | 'microdata'
  | 'hydration-state'
  | 'json-embedded'
  | 'json-ld'
  | 'heuristic-regex';

export interface GospelSong {
  id: string;
  title: string;
  artist: string;
  album?: string;
  releaseYear?: number;
  key?: string;
  bpm?: number;
  theme?: string[];
  bibleReferences?: string[];
  fullLyrics: string;
  chordsLyrics?: string;
  sections?: {
    type: 'intro' | 'verse' | 'pre-chorus' | 'chorus' | 'bridge' | 'outro' | 'tag';
    label: string;
    text: string;
    chords?: string;
  }[];
  author?: string;
  composer?: string;
  youtubeId?: string;
  spotifyUri?: string;
  source: LyricsSource;
  sourceUrl?: string;
  providerRef?: string;
  fetchedAt?: string;
  extractionMethod?: LyricsExtractionMethod;
  extraction?: {
    engine: string;
    version: string;
    method: LyricsExtractionMethod;
    parser: string;
    candidateCount: number;
    quality: {
      score: number;
      confidence: number;
      charCount: number;
      wordCount: number;
      lineCount: number;
      distinctLineRatio: number;
      duplicateLineRatio: number;
      averageLineLength: number;
      linkDensity: number;
    };
    signals: string[];
    warnings: string[];
  };
  tags?: string[];
}

export interface SearchQuery {
  query: string;
  artist?: string;
  title?: string;
  theme?: string;
  limit?: number;
  provider?: string;
  includeChords?: boolean;
}

export interface SearchResult {
  id: string;
  title: string;
  artist: string;
  album?: string;
  preview: string;
  theme?: string[];
  key?: string;
  source: string;
  sourceUrl?: string;
  providerRef?: string;
  score: number;
}

export interface ProxyConfig {
  version: string;
  serverName: string;
  port: number;
  enableCors: boolean;
  allowedOrigins: string[];
  rateLimit: {
    enabled: boolean;
    maxRequestsPerMin: number;
  };
  cache: {
    enabled: boolean;
    /** Compatibilidade com configurações antigas. */
    ttlSeconds: number;
    searchTtlSeconds: number;
    lyricsTtlSeconds: number;
    maxEntries: number;
  };
  security: {
    rawProxyEnabled: boolean;
    rawProxyAllowedHosts: string[];
    allowLocalAdminWithoutToken: boolean;
  };
  defaultProvider: 'built-in' | 'vagalume' | 'genius' | 'custom' | 'multi-provider';
  providers: {
    vagalume: {
      enabled: boolean;
      baseUrl: string;
      webBaseUrl: string;
      apiKey?: string;
      timeoutMs: number;
    };
    genius: {
      enabled: boolean;
      baseUrl: string;
      webBaseUrl: string;
      accessToken?: string;
      timeoutMs: number;
    };
    letrasMusBr: {
      enabled: boolean;
      baseUrl: string;
      timeoutMs: number;
    };
    customApi: {
      enabled: boolean;
      endpointUrl: string;
      authHeader?: string;
      customHeaders?: Record<string, string>;
      method: 'GET' | 'POST';
      responsePath?: string;
    };
  };
  filters: {
    onlyGospel: boolean;
    cleanHTML: boolean;
    autoTagThemes: boolean;
    formatVerses: boolean;
  };
}

export interface ProxyPublicConfig {
  version: string;
  serverName: string;
  port: number;
  enableCors: boolean;
  allowedOrigins: string[];
  rateLimit: ProxyConfig['rateLimit'];
  cache: ProxyConfig['cache'];
  security: {
    rawProxyEnabled: boolean;
    rawProxyAllowedHosts: string[];
    adminAuthConfigured: boolean;
    localAdminAllowed: boolean;
  };
  defaultProvider: ProxyConfig['defaultProvider'];
  providers: {
    vagalume: Omit<ProxyConfig['providers']['vagalume'], 'apiKey'> & { configured: boolean; apiKey?: string };
    genius: Omit<ProxyConfig['providers']['genius'], 'accessToken'> & { configured: boolean; accessToken?: string };
    letrasMusBr: ProxyConfig['providers']['letrasMusBr'];
    customApi: Omit<ProxyConfig['providers']['customApi'], 'authHeader' | 'customHeaders'> & {
      configured: boolean;
      authHeader?: string;
      customHeaders?: Record<string, string>;
    };
  };
  filters: ProxyConfig['filters'];
}

export interface ProxyTrafficLog {
  id: string;
  timestamp: string;
  method: string;
  path: string;
  targetProvider: string;
  status: number;
  latencyMs: number;
  ip?: string;
  requestId?: string;
  queryParam?: string;
  requestSize?: number;
  responseSize?: number;
  cached?: boolean;
  extractionMethod?: LyricsExtractionMethod;
  error?: string;
}

export interface RawProxyRequest {
  targetUrl: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: unknown;
  queryParams?: Record<string, string>;
  timeoutMs?: number;
}
