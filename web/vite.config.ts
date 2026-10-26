import { createReadStream, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

export default defineConfig(({ mode }) => {
  // Ports live in the repo-root .env, shared with the server.
  const env = loadEnv(mode, "..", "");
  const webPort = Number(env.WEB_PORT || 5173);
  const serverPort = Number(env.SERVER_PORT || 3000);

  return {
    plugins: [react(), pdfjsResources()],
    server: {
      // Listen on the LAN so the iPhone can open http://<Mac IP>:<port>.
      host: true,
      port: webPort,
      strictPort: true,
      proxy: {
        // xfwd: the server learns each device's address (x-forwarded-for), so the sign-in limits
        // count per device rather than for the whole home network at once (§4 Accounts, Rate limits).
        "/api": { target: `http://127.0.0.1:${serverPort}`, xfwd: true },
      },
    },
  };
});

/**
 * pdf.js fetches some files at run time from folders named in `getDocument` (§6.8): fonts a PDF
 * doesn't embed (standard_fonts), CMaps, the JPEG 2000 and JBIG2 image decoders scanned books
 * need (wasm, with the plain JavaScript fallbacks Safari 18 uses) and colour profiles (iccs). They
 * are served from `pdfjs-dist` at `/pdfjs/<folder>/` in dev and copied to the same place by
 * `vite build`. The scripting engine (quickjs) is left out: the app never runs a PDF's JavaScript.
 */
function pdfjsResources(): Plugin {
  const root = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));
  const folders = ["cmaps", "standard_fonts", "wasm", "iccs"];
  const wanted = (name: string) => !name.startsWith(".") && !name.startsWith("quickjs");
  const types: Record<string, string> = {
    ".bcmap": "application/octet-stream",
    ".icc": "application/vnd.iccprofile",
    ".js": "text/javascript",
    ".pfb": "application/octet-stream",
    ".ttf": "font/ttf",
    ".wasm": "application/wasm",
  };

  return {
    name: "pdfjs-resources",
    configureServer(server) {
      server.middlewares.use("/pdfjs", (req, res, next) => {
        const [folder, name, ...rest] = decodeURIComponent((req.url ?? "").split("?")[0] ?? "")
          .slice(1)
          .split("/");
        if (!folder || !folders.includes(folder) || !name || !wanted(name) || rest.length) {
          return next();
        }
        const path = join(root, folder, name);
        try {
          if (!statSync(path).isFile()) return next();
        } catch {
          return next();
        }
        res.setHeader("Content-Type", types[extname(name)] ?? "application/octet-stream");
        createReadStream(path).pipe(res);
      });
    },
    generateBundle() {
      for (const folder of folders) {
        for (const name of readdirSync(join(root, folder)).filter(wanted)) {
          this.emitFile({
            type: "asset",
            fileName: `pdfjs/${folder}/${name}`,
            source: readFileSync(join(root, folder, name)),
          });
        }
      }
    },
  };
}
