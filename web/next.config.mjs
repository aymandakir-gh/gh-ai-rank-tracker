import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
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

export default nextConfig;
