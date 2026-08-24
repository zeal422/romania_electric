import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // Rutele server-only citesc data/*.json la runtime (fs.readFile +
  // process.cwd()); glob-ul le include explicit în bundle-ul fiecărei rute API,
  // fără a depinde de analiza statică implicită a file-tracing-ului.
  outputFileTracingIncludes: {
    "/api/**": ["./data/**"],
  },
};

export default nextConfig;
