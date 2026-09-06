import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const portfolio = JSON.parse(await readFile(new URL('./data/portfolio.json', import.meta.url), 'utf8'));
// An explicit, public-only catalog. No GitHub credentials or private repositories are served.
const excluded = new Set(['my-portfolio', 'my-portfolio-api', 'portfolio', 'portfolio-api']);
const projects = portfolio.projects.filter(p => !excluded.has(p.id.toLowerCase()));
export function createApp({ allowedOrigins = ['http://localhost:3000'], rateLimit = 120, windowMs = 60_000, logger = console.log } = {}) {
  const requests = new Map();
  const started = Date.now();
  return createServer((req, res) => {
    const origin = req.headers.origin;
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.setHeader('Vary', 'Origin');
    const send = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify(data));
    };
    // Trust only the socket peer. The reverse proxy cannot be bypassed in Compose.
    const key = req.socket.remoteAddress ?? 'unknown';
    const now = Date.now();
    for (const [ip, record] of requests) if (record.reset <= now) requests.delete(ip);
    const record = requests.get(key) ?? { count: 0, reset: now + windowMs };
    record.count++; requests.set(key, record);
    res.once('finish', () => logger(JSON.stringify({ method: req.method, path: req.url?.split('?')[0], status: res.statusCode, durationMs: Date.now() - now })));
    if (record.count > rateLimit) {
      res.setHeader('Retry-After', Math.max(1, Math.ceil((record.reset - now) / 1000)));
      return send(429, { error: 'Too many requests. Try again shortly.' });
    }
    if (origin && !allowedOrigins.includes(origin)) return send(403, { error: 'Origin not allowed' });
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Max-Age', '600');
      res.writeHead(204); return res.end();
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.setHeader('Allow', 'GET, HEAD, OPTIONS'); return send(405, { error: 'Method not allowed' });
    }
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { return send(400, { error: 'Invalid URL' }); }
    if (url.pathname === '/healthz') {
      res.setHeader('Cache-Control', 'no-store');
      return send(200, { status: 'ok', service: 'aiman-portfolio-api', uptimeSeconds: Math.floor((now - started) / 1000) });
    }
    if (url.pathname === '/api/profile') return send(200, { name: portfolio.name, username: portfolio.owner, github: 'https://github.com/aimancreator', reviewedAt: portfolio.reviewedAt });
    if (url.pathname === '/api/skills') {
      res.setHeader('Cache-Control', 'no-store');
      return send(200, { skills: portfolio.skills ?? [] });
    }
    if (url.pathname === '/api/projects') {
      res.setHeader('Cache-Control', 'public, max-age=300');
      const q = (url.searchParams.get('q') ?? '').toLowerCase();
      const category = url.searchParams.get('category');
      const filtered = projects.filter(p => (!category || p.category === category) && `${p.title} ${p.description} ${p.tags.join(' ')}`.toLowerCase().includes(q));
      return send(200, { projects: filtered, total: filtered.length, reviewedAt: portfolio.reviewedAt });
    }
    if (url.pathname.startsWith('/api/projects/')) {
      const project = projects.find(p => p.id === url.pathname.slice('/api/projects/'.length));
      return project ? send(200, { project }) : send(404, { error: 'Project not found' });
    }
    return send(404, { error: 'Not found' });
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 4000);
  const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map(s => s.trim()).filter(Boolean);
  const server = createApp({ allowedOrigins, rateLimit: Number(process.env.RATE_LIMIT ?? 120) });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.listen(port, process.env.HOST ?? '0.0.0.0', () => console.log(`Portfolio API listening on port ${port}`));
  const shutdown = () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 10_000).unref(); };
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
}
