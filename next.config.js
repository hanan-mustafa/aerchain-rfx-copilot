/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse", "mammoth", "xlsx"],
    // These files are read with fs at runtime via computed paths, which
    // Next's file tracing can't see -- without this they are missing from
    // the Vercel function bundles.
    outputFileTracingIncludes: {
      "/api/extract": ["./data/vendor-uploads/**", "./data/extraction-cache/**", "./data/seed/**"],
      "/api/files/[vendorId]": ["./data/vendor-uploads/**"],
      "/api/vendors": ["./data/seed/**"],
      "/api/chat": ["./data/seed/**"],
    },
  },
};

module.exports = nextConfig;
