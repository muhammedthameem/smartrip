import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const buildTimestamp = Date.now();

function versionTrackerPlugin() {
  return {
    name: "version-tracker",
    generateBundle() {
      const now = Date.now();
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify(
          {
            version: process.env.npm_package_version || "0.1.0",
            buildTime: now,
            updatedAt: new Date(now).toISOString(),
          },
          null,
          2
        ),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), versionTrackerPlugin()],
  define: {
    __APP_BUILD_TIME__: JSON.stringify(buildTimestamp),
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || "0.1.0"),
  },
  build: { chunkSizeWarningLimit: 450 },
});

