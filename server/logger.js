import pino from 'pino';
export const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    base: { service: 'gospel-lyrics-proxy' },
    redact: {
        paths: [
            'req.headers.authorization',
            'headers.authorization',
            'apiKey',
            'accessToken',
            'authHeader',
            '*.apiKey',
            '*.accessToken',
            '*.authHeader',
        ],
        censor: '[REDACTED]',
    },
});
