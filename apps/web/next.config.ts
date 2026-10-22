import type { NextConfig } from 'next';


const API_URL = process.env.API_URL ?? 'http://localhost:3333';

const config: NextConfig = {
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }];
  },
};

export default config;
