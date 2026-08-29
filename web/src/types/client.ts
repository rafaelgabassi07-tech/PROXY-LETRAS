import type { GospelSong, ProxyConfig, ProxyTrafficLog, SearchResult } from '../../server/types.ts';

export type ActiveTab = 'lyrics-tester' | 'raw-proxy' | 'chatgpt-guide' | 'config' | 'logs';

export interface HealthData {
  status: string;
  service: string;
  version: string;
  uptimeSeconds: number;
  cache: {
    size: number;
    keys: string[];
  };
  defaultProvider: string;
  activeProviders: string[];
  scraperEngine?: {
    name: string;
    version: string;
    parsers: string[];
  };
  capabilities?: string[];
  security?: {
    rawProxyEnabled: boolean;
    adminAuthConfigured: boolean;
  };
  timestamp: string;
}

export interface SearchApiResponse {
  success: boolean;
  query: any;
  count: number;
  provider: string;
  cached: boolean;
  latencyMs: number;
  data: SearchResult[];
}

export interface LyricsApiResponse {
  success: boolean;
  provider: string;
  cached: boolean;
  latencyMs: number;
  data: GospelSong;
}
