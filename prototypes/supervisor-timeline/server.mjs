import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const assets = new Map([
  ["/styles.css", { file: "styles.css", type: "text/css; charset=utf-8" }],
  ["/app.js", { file: "app.js", type: "text/javascript; charset=utf-8" }],
  ["/favicon.svg", { file: "favicon.svg", type: "image/svg+xml" }],
]);
const projectRoute = /^\/[a-zA-Z0-9_-]{1,64}\/?$/u;

const securityHeaders = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

export function createPreviewServer() {
  return createServer(async (request, response) => {
    try {
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { ...securityHeaders, Allow: "GET, HEAD" });
        response.end();
        return;
      }

      const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      if (pathname === "/robots.txt") {
        const body = Buffer.from("User-agent: *\nDisallow: /\n", "utf8");
        response.writeHead(200, {
          ...securityHeaders,
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Length": body.length,
        });
        response.end(request.method === "HEAD" ? undefined : body);
        return;
      }

      const asset = assets.get(pathname);
      const publicFile = asset ?? (pathname === "/" || projectRoute.test(pathname)
        ? { file: "index.html", type: "text/html; charset=utf-8" }
        : null);
      if (!publicFile) {
        response.writeHead(404, { ...securityHeaders, "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }

      const body = await readFile(resolve(root, publicFile.file));
      response.writeHead(200, {
        ...securityHeaders,
        "Content-Type": publicFile.type,
        "Content-Length": body.length,
      });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch {
      response.writeHead(500, { ...securityHeaders, "Content-Type": "text/plain; charset=utf-8" });
      response.end("Preview unavailable");
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number.parseInt(process.env.SUPERVISOR_UI_PREVIEW_PORT ?? "8790", 10);
  const server = createPreviewServer();
  server.listen(port, "127.0.0.1", () => {
    process.stdout.write(`Supervisor UI preview: http://127.0.0.1:${port}/factures_platform\n`);
  });
}
