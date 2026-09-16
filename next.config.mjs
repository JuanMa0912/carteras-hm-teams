/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // El tablero es 100% cliente: el Excel se procesa en el navegador y nunca
  // se envia al servidor. No hay rutas de API ni persistencia en servidor.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ];
  },
};

export default nextConfig;
