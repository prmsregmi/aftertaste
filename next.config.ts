import { withMcpUse } from "mcp-use/next";

// Inline config object: annotating it as NextConfig conflicts with mcp-use's turbopack alias type.
export default withMcpUse(
  {
    cacheComponents: true,
    partialPrefetching: true,
    turbopack: {
      rules: {
        "*.css": {
          loaders: ["@tailwindcss/turbopack"],
          as: "*.css",
        },
      },
    },
  },
  { entry: "./src/mcp/server.ts", viewsDir: "src/mcp/views", basePath: "/api/mcp" },
);
