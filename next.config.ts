import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native / large server-only libraries stay out of the bundle
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas", "pdfkit", "exceljs", "pg", "@prisma/client"],
  outputFileTracingIncludes: { "/api/**": ["./assets/fonts/**"] },
};

export default nextConfig;
