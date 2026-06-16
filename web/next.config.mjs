import { withSentryConfig } from '@sentry/nextjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    instrumentationHook: true,
  },
  webpack: (config) => {
    // Resolve @engine → ../src/web.ts (avoids pulling in Hono from src/index.ts)
    config.resolve.alias['@engine'] = path.join(__dirname, '../src/web.ts');
    // Allow .ts extensions to be resolved when .js is imported from the engine
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  disableLogger: true,
  automaticVercelMonitors: false,
  widenClientFileUpload: false,
  // Skip source-map generation/upload when SENTRY_AUTH_TOKEN is absent
  // (OSS forks / local dev) — avoids publishing source maps without a token.
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
