import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { yocoApiHandler } from './server/yoco.mjs';
import { accountApiHandler } from './server/accounts.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const port = Number(process.env.PORT || 3000);

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

const sendStatic = async (req, res) => {
  const requestPath = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
  const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  const candidate = path.resolve(dist, relativePath);
  if (!candidate.startsWith(`${dist}${path.sep}`)) {
    res.statusCode = 400;
    res.end('Bad request');
    return;
  }
  let filePath = candidate;
  try {
    await fs.access(filePath);
  } catch {
    if (requestPath.startsWith('/api/')) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    filePath = path.join(dist, 'index.html');
  }
  const data = await fs.readFile(filePath);
  res.statusCode = 200;
  res.setHeader('Content-Type', contentTypes[path.extname(filePath)] || 'application/octet-stream');
  res.setHeader('Cache-Control', path.extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable');
  if (req.method !== 'HEAD') res.end(data);
  else res.end();
};

const server = http.createServer(async (req, res) => {
  if (req.url === '/_app/health') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  try {
    if (await accountApiHandler(req, res)) return;
    if (await yocoApiHandler(req, res)) return;
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.statusCode = 405;
      res.end('Method not allowed');
      return;
    }
    await sendStatic(req, res);
  } catch (error) {
    console.error('Server error:', error);
    if (!res.headersSent) res.statusCode = 500;
    res.end('Internal server error');
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`SHEABLISS server listening on ${port}`);
});
