import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Vercel Hobby caps functions at 10s (docs/10 §1). Nothing here may block on
  // MoMo — persist, fire, return. See docs/01 §6.
  experimental: {},
};

export default nextConfig;
