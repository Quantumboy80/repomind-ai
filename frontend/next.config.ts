import type { NextConfig } from 'next';

const apiOrigin = process.env.FASTAPI_INTERNAL_URL || 'http://127.0.0.1:8000';
const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: '/api/backend/:path*', destination: `${apiOrigin}/api/:path*` }];
  },
};

export default nextConfig;
