import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" keeps the build relocatable: works at a domain root or in a sub-path.
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: { port: 5190, strictPort: true },
  preview: { port: 5191, strictPort: true },
  // The Lucide catalog is a lazy chunk loaded only when the Icons panel opens.
  build: { chunkSizeWarningLimit: 800 },
});
