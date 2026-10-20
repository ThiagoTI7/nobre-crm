import type { NextConfig } from 'next';

// O navegador fala só com o Next (mesma origem); o Next encaminha /api/* para a API.
// Assim não há CORS no uso normal e a URL da API fica no servidor.
const API_URL = process.env.API_URL ?? 'http://localhost:3333';

const config: NextConfig = {
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }];
  },
};

export default config;
