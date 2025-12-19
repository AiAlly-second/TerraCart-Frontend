import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    sourcemap: false,
    minify: "esbuild", // Use esbuild (built-in) instead of terser for better deployment compatibility
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Vendor chunks
          if (id.includes("node_modules")) {
            if (id.includes("react") || id.includes("react-dom")) {
              return "vendor-react";
            }
            if (id.includes("react-router")) {
              return "vendor-router";
            }
            if (id.includes("framer-motion")) {
              return "vendor-motion";
            }
            if (id.includes("socket.io-client")) {
              return "vendor-socket";
            }
            if (id.includes("react-icons") || id.includes("@heroicons")) {
              return "vendor-icons";
            }
            // Other large dependencies
            if (id.includes("html2canvas") || id.includes("jspdf")) {
              return "vendor-pdf";
            }
            // All other node_modules
            return "vendor";
          }
          // Page chunks for better code splitting
          if (id.includes("/pages/")) {
            const pageName = id.split("/pages/")[1]?.split("/")[0];
            if (pageName) {
              return `page-${pageName}`;
            }
          }
        },
        // Optimize chunk size
        chunkSizeWarningLimit: 1000,
      },
    },
    // Optimize build performance
    target: "esnext",
    cssCodeSplit: true,
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  preview: {
    port: 4173,
    strictPort: false,
  },
});
