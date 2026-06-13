// Zero-dependency static file server for the no-build launcher.
// Usage:  node serve.mjs        (then open http://localhost:8080/)
//         PORT=3000 node serve.mjs
// Needs only Node — no `npm install` required.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.glb': 'model/gltf-binary',
};

const server = createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/' || pathname === '') pathname = '/standalone.html';

    // Resolve within ROOT and reject path traversal.
    const filePath = resolve(ROOT, '.' + pathname);
    if (filePath !== ROOT && !filePath.startsWith(ROOT + (process.platform === 'win32' ? '\\' : '/'))) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('403 Forbidden');
      return;
    }

    const data = await readFile(filePath);
    const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch (err) {
    res.writeHead(err.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain' });
    res.end(err.code === 'ENOENT' ? '404 Not Found' : '500 Server Error');
  }
});

server.listen(PORT, () => {
  console.log('\n  \x1b[31mULTIMATE GRANNY\x1b[0m is running.');
  console.log(`\n  Open  \x1b[36mhttp://localhost:${PORT}/\x1b[0m  in your browser.`);
  console.log('\n  (Press Ctrl+C to stop.)\n');
});
