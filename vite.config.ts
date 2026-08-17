import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    tanstackStart(),
    nitro({ preset: "vercel" }),
    react(),
    tailwindcss(),
  ],
  build: {
    target: "es2022",
    rollupOptions: {
      output: {
        entryFileNames: "assets/gizmo.js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith(".css")) return "assets/gizmo.css";
          return "assets/[name]-[hash][extname]";
        },
      },
    },
  },
});
