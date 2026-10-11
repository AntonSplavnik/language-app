import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // Ports live in the repo-root .env, shared with the server.
  const env = loadEnv(mode, "..", "");
  const webPort = Number(env.WEB_PORT || 5173);
  const serverPort = Number(env.SERVER_PORT || 3000);

  return {
    plugins: [react()],
    server: {
      // Listen on the LAN so the iPhone can open http://<Mac IP>:<port>.
      host: true,
      port: webPort,
      strictPort: true,
      proxy: {
        "/api": `http://127.0.0.1:${serverPort}`,
      },
    },
  };
});
