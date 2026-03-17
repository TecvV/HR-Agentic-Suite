#!/usr/bin/env node
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = { port: 5601 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--port" && i + 1 < argv.length) {
      args.port = Number(argv[i + 1]);
      i += 1;
    }
  }
  return args;
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function safeResolve(baseDir, requestPath) {
  const cleanPath = requestPath.split("?")[0].split("#")[0];
  const normalized = path.normalize(decodeURIComponent(cleanPath)).replace(/^([.][.][\\/])+/, "");
  const resolved = path.resolve(baseDir, `.${normalized}`);
  if (!resolved.startsWith(baseDir)) {
    return null;
  }
  return resolved;
}

const { port } = parseArgs(process.argv.slice(2));
const baseDir = path.resolve(process.cwd());

const server = http.createServer((req, res) => {
  const reqPath = req.url === "/" ? "/frontend/index.html" : req.url;
  const resolved = safeResolve(baseDir, reqPath);

  if (!resolved) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  let filePath = resolved;
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
});

server.listen(port, () => {
  process.stdout.write(`Frontend server running at http://localhost:${port}/frontend/\n`);
});
