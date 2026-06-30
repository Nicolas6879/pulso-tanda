/** @type {import('next').NextConfig} */
const nextConfig = {
  // El paquete de bindings se distribuye como TS/ESM; que Next lo transpile.
  transpilePackages: ["tanda-client"],
};

export default nextConfig;
