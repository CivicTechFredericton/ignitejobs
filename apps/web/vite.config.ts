import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: { tsconfigPaths: true },
  // The server build's entry is our Hono app (API + React Router), not the bare route build.
  environments: { ssr: { build: { rolldownOptions: { input: "./server/app.ts" } } } },
});
