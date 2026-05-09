/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['mapbox-gl'],
  images: {
    domains: ['localhost'],
  },
  async headers() {
    return [
      {
        source: '/workers/:path*',
        headers: [
          { key: 'Content-Type', value: 'application/javascript' },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      { source: '/api/:path*', destination: 'http://localhost:8000/api/:path*' },
      { source: '/ws/:path*', destination: 'http://localhost:8000/ws/:path*' },
    ];
  },
};

module.exports = nextConfig;
