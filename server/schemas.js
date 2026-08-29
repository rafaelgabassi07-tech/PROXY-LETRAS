import { z } from 'zod';
const trimmed = (max) => z.string().trim().max(max);
const optionalTrimmed = (max) => trimmed(max).optional().default('');
export const SearchQuerySchema = z.object({
    query: optionalTrimmed(160),
    artist: optionalTrimmed(120),
    title: optionalTrimmed(160),
    theme: optionalTrimmed(80),
    limit: z.coerce.number().int().min(1).max(25).optional().default(12),
    provider: z.enum(['multi-provider', 'built-in', 'database', 'letras_mus_br', 'genius', 'vagalume', 'custom', 'custom_api']).optional().default('multi-provider'),
    includeChords: z.boolean().optional().default(false),
}).strict();
export const LyricsRequestSchema = z.object({
    id: optionalTrimmed(200),
    artist: optionalTrimmed(120),
    title: optionalTrimmed(160),
    provider: optionalTrimmed(40),
    sourceUrl: optionalTrimmed(1200),
    providerRef: optionalTrimmed(200),
}).strict().refine((value) => Boolean(value.id || value.artist || value.title || value.sourceUrl), { message: 'Informe id, título/artista ou sourceUrl.' });
const safeHeaderRecord = z.record(z.string().max(120), z.string().max(4000)).optional();
export const RawProxyRequestSchema = z.object({
    targetUrl: z.string().trim().url().max(1800),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).optional().default('GET'),
    headers: safeHeaderRecord,
    body: z.unknown().optional(),
    queryParams: z.record(z.string().max(120), z.string().max(4000)).optional(),
    timeoutMs: z.coerce.number().int().min(1000).max(15000).optional().default(8000),
}).strict();
const providerBase = z.object({
    enabled: z.boolean().optional(),
    baseUrl: z.string().trim().url().max(1200).optional(),
    webBaseUrl: z.string().trim().url().max(1200).optional(),
    timeoutMs: z.coerce.number().int().min(1000).max(15000).optional(),
}).strict();
export const ProxyConfigUpdateSchema = z.object({
    enableCors: z.boolean().optional(),
    allowedOrigins: z.array(z.string().trim().min(1).max(300)).max(32).optional(),
    rateLimit: z.object({
        enabled: z.boolean().optional(),
        maxRequestsPerMin: z.coerce.number().int().min(10).max(3000).optional(),
    }).strict().optional(),
    cache: z.object({
        enabled: z.boolean().optional(),
        ttlSeconds: z.coerce.number().int().min(30).max(604800).optional(),
        searchTtlSeconds: z.coerce.number().int().min(30).max(86400).optional(),
        lyricsTtlSeconds: z.coerce.number().int().min(60).max(2592000).optional(),
        maxEntries: z.coerce.number().int().min(20).max(5000).optional(),
    }).strict().optional(),
    security: z.object({
        rawProxyEnabled: z.boolean().optional(),
        rawProxyAllowedHosts: z.array(z.string().trim().min(1).max(253)).max(64).optional(),
        allowLocalAdminWithoutToken: z.boolean().optional(),
    }).strict().optional(),
    defaultProvider: z.enum(['built-in', 'vagalume', 'genius', 'custom', 'multi-provider']).optional(),
    providers: z.object({
        vagalume: providerBase.extend({ apiKey: z.string().max(1000).optional() }).strict().optional(),
        genius: providerBase.extend({ accessToken: z.string().max(2000).optional() }).strict().optional(),
        letrasMusBr: providerBase.optional(),
        customApi: z.object({
            enabled: z.boolean().optional(),
            endpointUrl: z.string().trim().max(1200).optional(),
            authHeader: z.string().max(4000).optional(),
            customHeaders: z.record(z.string().max(120), z.string().max(4000)).optional(),
            method: z.enum(['GET', 'POST']).optional(),
            responsePath: z.string().trim().max(240).optional(),
        }).strict().optional(),
    }).strict().optional(),
    filters: z.object({
        onlyGospel: z.boolean().optional(),
        cleanHTML: z.boolean().optional(),
        autoTagThemes: z.boolean().optional(),
        formatVerses: z.boolean().optional(),
    }).strict().optional(),
}).strict();
export function zodIssueMessage(error) {
    return error.issues
        .slice(0, 4)
        .map(issue => `${issue.path.join('.') || 'body'}: ${issue.message}`)
        .join('; ');
}
