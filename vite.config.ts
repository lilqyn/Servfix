import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: mode === "production" ? "./" : "/",
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("@tanstack/react-query")) {
              return "vendor-query";
            }
            if (id.includes("recharts")) {
              return "vendor-charts";
            }
            if (id.includes("@radix-ui") || id.includes("vaul") || id.includes("cmdk")) {
              return "vendor-radix";
            }
            if (
              id.includes("react-hook-form") ||
              id.includes("@hookform/resolvers") ||
              id.includes("zod")
            ) {
              return "vendor-forms";
            }
            if (id.includes("lucide-react") || id.includes("date-fns")) {
              return "vendor-ui";
            }
            return "vendor";
          }

          if (id.includes("/src/pages/admin/")) {
            return "admin-pages";
          }

          if (id.includes("/src/components/dashboard/") || id.includes("/src/pages/ProviderDashboard")) {
            return "provider-dashboard";
          }
        },
      },
    },
  },
}));
