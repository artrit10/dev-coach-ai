import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The API key lives only on the server; the browser talks to it through this proxy.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { "/api": "http://127.0.0.1:3001" },
  },
});
