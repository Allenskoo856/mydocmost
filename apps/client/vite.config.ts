import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import * as path from "path";

export const envPath = path.resolve(process.cwd(), "..", "..");

export default defineConfig(({ mode }) => {
  const {
    APP_URL,
    BASE_PATH,
    FILE_UPLOAD_SIZE_LIMIT,
    FILE_IMPORT_SIZE_LIMIT,
    DRAWIO_URL,
    CLOUD,
    SUBDOMAIN_HOST,
    COLLAB_URL,
    BILLING_TRIAL_DAYS,
  } = loadEnv(mode, envPath, "");

  const basePath =
    BASE_PATH && BASE_PATH !== "/"
      ? BASE_PATH.startsWith("/")
        ? BASE_PATH
        : `/${BASE_PATH}`
      : "/";

  return {
    base: basePath,
    define: {
      "process.env": {
        APP_URL,
        BASE_PATH: basePath === "/" ? "" : basePath,
        FILE_UPLOAD_SIZE_LIMIT,
        FILE_IMPORT_SIZE_LIMIT,
        DRAWIO_URL,
        CLOUD,
        SUBDOMAIN_HOST,
        COLLAB_URL,
        BILLING_TRIAL_DAYS,
      },
      APP_VERSION: JSON.stringify(process.env.npm_package_version),
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": "/src",
      },
    },
    server: {
      proxy: {
        [`${basePath}/api`]: {
          target: APP_URL,
          changeOrigin: false,
        },
        [`${basePath}/socket.io`]: {
          target: APP_URL,
          ws: true,
          rewriteWsOrigin: true,
        },
        [`${basePath}/collab`]: {
          target: APP_URL,
          ws: true,
          rewriteWsOrigin: true,
        },
      },
    },
  };
});
