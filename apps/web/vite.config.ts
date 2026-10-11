import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: { tsconfigPaths: true },
  server: {
    // In dev the browser talks to the API through Vite; in prod Caddy routes /api.
    proxy: { "/api": process.env.API_URL ?? "http://localhost:4000" },
  },
});
