import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.mjs';
async function fixture(t, options = {}) {
  const server = createApp({ logger: () => {}, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return (path, init) => fetch(`http://127.0.0.1:${server.address().port}${path}`, init);
}
test('catalog contains public source links and excludes portfolio repositories', async t => {
  const get = await fixture(t);
  const res = await get('/api/projects'); assert.equal(res.status, 200);
  const body = await res.json(); assert.equal(body.total, 5);
  assert.ok(body.projects.every(p => p.url.startsWith('https://github.com/aimancreator/') && !p.id.includes('portfolio')));
  const detail = await (await get('/api/projects/reconviagen-studio')).json(); assert.equal(detail.project.title, 'ReconViaGen Studio');
});
test('search, category filters, unknown project and method handling', async t => {
  const get = await fixture(t);
  const body = await (await get('/api/projects?category=Automation&q=smtp')).json();
  assert.deepEqual(body.projects.map(p => p.id), ['send-email-using-imap']);
  assert.equal((await get('/api/projects/missing')).status, 404);
  assert.equal((await get('/api/projects', { method: 'POST' })).status, 405);
  assert.equal((await get('/api/projects', { method: 'HEAD' })).status, 200);
});
test('only explicitly configured origins receive CORS access', async t => {
  const get = await fixture(t);
  const allowed = await get('/api/projects', { headers: { Origin: 'http://localhost:3000' } });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:3000');
  assert.equal((await get('/api/projects', { headers: { Origin: 'https://untrusted.example' } })).status, 403);
  assert.equal((await get('/api/projects', { method: 'OPTIONS', headers: { Origin: 'http://localhost:3000' } })).status, 204);
});
test('health endpoint and rate limit with retry header', async t => {
  const get = await fixture(t, { rateLimit: 1 });
  assert.equal((await (await get('/healthz')).json()).status, 'ok');
  const limited = await get('/healthz'); assert.equal(limited.status, 429); assert.ok(Number(limited.headers.get('retry-after')) > 0);
});

test('skills endpoint returns editable backend skill records', async t => {
  const get = await fixture(t);
  const res = await get('/api/skills');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const body = await res.json();
  assert.ok(body.skills.length > 0);
  assert.ok(body.skills.every(s => typeof s.name === 'string' && typeof s.category === 'string' && typeof s.description === 'string'));
});
