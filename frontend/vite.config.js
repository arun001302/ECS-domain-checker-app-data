import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // During local dev, proxy /api calls to the Flask backend
    // This way React doesn't need to know the backend URL in dev mode
    // In production (ECS), the ALB handles this routing at the network level
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: "dist",
    sourcemap: false  // Don't ship sourcemaps in production container
  }
});