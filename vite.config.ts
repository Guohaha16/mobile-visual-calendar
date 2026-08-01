import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      includeAssets: [
        "assets/calendar-paper-template.png",
        "assets/calendar-book.png",
        "fonts/MaShanZheng-Regular.ttf",
        "fonts/OFL.txt",
        "icons/*.png",
      ],
      manifest: {
        background_color: "#f2f2ef",
        display: "standalone",
        icons: [
          {
            sizes: "192x192",
            src: "/icons/icon-192.png",
            type: "image/png",
          },
          {
            sizes: "512x512",
            src: "/icons/icon-512.png",
            type: "image/png",
          },
          {
            purpose: "maskable",
            sizes: "512x512",
            src: "/icons/maskable-512.png",
            type: "image/png",
          },
        ],
        name: "Visual Calendar",
        short_name: "Calendar",
        start_url: "/",
        theme_color: "#f2f2ef",
      },
      registerType: "prompt",
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg}"],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        navigateFallback: "/index.html",
      },
    }),
  ],
});
