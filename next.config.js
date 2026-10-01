/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse", "mammoth", "xlsx"],
    // These files are read with fs at runtime via computed paths, which
    // Next's file tracing can't see -- without this they are missing from
    // the Vercel function bundles.
    outputFileTracingIncludes: {
      "/api/sample": ["./data/vendor-uploads/**", "./data/extraction-cache/**"],
      "/api/responses/sample": ["./data/vendor-uploads/**", "./data/extraction-cache/**"],
      "/api/responses/process": ["./data/extraction-cache/**"],
      "/api/files/[vendorId]": ["./data/vendor-uploads/**"],
    },
  },
};

module.exports = nextConfig;
