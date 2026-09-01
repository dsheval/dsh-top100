import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { request as httpsRequest } from "node:https";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(new URL("..", import.meta.url)));
const publicRoot = join(projectRoot, "web/public");
const port = Number(process.env.WEB_PORT ?? "4173");
const dataOrigin = new URL(process.env.DSH_DATA_ORIGIN ?? "https://www.dsheval.ai");

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
]);

function proxyData(request, response) {
  const upstream = httpsRequest(
    {
      hostname: dataOrigin.hostname,
      port: dataOrigin.port || 443,
      method: request.method === "HEAD" ? "HEAD" : "GET",
      path: request.url,
      headers: {
        accept: request.headers.accept ?? "application/json",
        "user-agent": "dsh-top100-local-preview/1.0",
      },
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, {
        "cache-control": upstreamResponse.headers["cache-control"] ?? "no-cache",
        "content-encoding": upstreamResponse.headers["content-encoding"] ?? "identity",
        "content-type": upstreamResponse.headers["content-type"] ?? "application/json",
        vary: upstreamResponse.headers.vary ?? "Accept-Encoding",
      });
      upstreamResponse.pipe(response);
    }
  );
  upstream.on("error", (error) => {
    response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    response.end(`Data proxy failed: ${error.message}`);
  });
  upstream.end();
}

function localFileFor(pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const candidate = normalize(join(publicRoot, decodedPath));
  if (candidate !== publicRoot && !candidate.startsWith(`${publicRoot}${sep}`)) return null;
  if (!existsSync(candidate) || !statSync(candidate).isFile()) return null;
  return candidate;
}

const server = createServer((request, response) => {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
  if (requestUrl.pathname.startsWith("/data/")) return proxyData(request, response);
  if (requestUrl.pathname === "/api/events") {
    response.writeHead(204);
    return response.end();
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { allow: "GET, HEAD" });
    return response.end();
  }

  const path = localFileFor(requestUrl.pathname) ?? join(publicRoot, "index.html");
  response.writeHead(200, {
    "cache-control": "no-cache",
    "content-type": mimeTypes.get(extname(path)) ?? "application/octet-stream",
  });
  if (request.method === "HEAD") return response.end();
  createReadStream(path).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Local preview: http://127.0.0.1:${port}/`);
  console.log(`Ranking data: ${dataOrigin.origin}/data/`);
});
