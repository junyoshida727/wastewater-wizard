import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable, PassThrough } from 'node:stream';
import { createRequestHandler } from '../scripts/dev-server.mjs';

async function fixture(t, streamFactory) {
  const parent = await mkdtemp(join(tmpdir(), 'ww-server-'));
  const root = join(parent, 'site');
  await mkdir(root);
  await mkdir(join(root, 'scripts'));
  await writeFile(join(root, 'index.html'), '<h1>Wizard</h1>');
  await writeFile(join(root, 'app.js'), 'const value = 1;');
  await writeFile(join(root, '日本語.svg'), '<svg/>');
  await writeFile(join(parent, 'private.txt'), 'outside root');
  await symlink(join(parent, 'private.txt'), join(root, 'outside.txt'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  return createRequestHandler(root, streamFactory);
}

async function request(handler, url, method = 'GET') {
  const chunks = [];
  const response = new Writable({ write(chunk, encoding, done) { chunks.push(chunk.toString()); done(); } });
  response.headersSent = false;
  response.writeHead = (status, headers) => { response.status = status; response.headers = headers; response.headersSent = true; };
  const completed = new Promise(resolve => {
    response.once('finish', () => resolve({ status: response.status, headers: response.headers, body: chunks.join('') }));
    response.once('error', error => resolve({ status: response.status, error }));
  });
  await handler({ url, method }, response);
  return completed;
}

test('server serves root with queries, assets and HEAD requests', { timeout: 3000 }, async t => {
  const handler = await fixture(t);
  for (const url of ['/', '/?v=review', '/?v=1&x=2', '/index.html?test=1']) {
    const result = await request(handler, url);
    assert.equal(result.status, 200);
    assert.equal(result.body, '<h1>Wizard</h1>');
  }
  assert.equal((await request(handler, '/app.js')).headers['Content-Type'], 'text/javascript; charset=utf-8');
  assert.equal((await request(handler, '/' + encodeURIComponent('日本語.svg'))).body, '<svg/>');
  const head = await request(handler, '/', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
});

test('directories, missing files and paths outside the root never stop subsequent requests', { timeout: 3000 }, async t => {
  const handler = await fixture(t);
  for (const url of ['/scripts/', '/missing', '/app.js/child', '/%2e%2e%2fprivate.txt', '/outside.txt']) {
    assert.equal((await request(handler, url)).status, 404, url);
    assert.equal((await request(handler, '/')).status, 200);
  }
  for (const url of ['/%ZZ', '/%00']) assert.equal((await request(handler, url)).status, 400);
});

test('invalid server roots fail requests without an unhandled startup rejection', { timeout: 3000 }, async () => {
  const handler = createRequestHandler('/definitely/not/a/real/root');
  assert.equal((await request(handler, '/')).status, 500);
});

test('file disappearance and read failures return an error instead of an unhandled stream event', { timeout: 3000 }, async t => {
  for (const code of ['ENOENT', 'EACCES']) {
    const handler = await fixture(t, () => {
      const stream = new PassThrough();
      queueMicrotask(() => stream.destroy(Object.assign(new Error('read failed'), { code })));
      return stream;
    });
    assert.equal((await request(handler, '/')).status, code === 'ENOENT' ? 404 : 500);
  }
});

test('a stream error after headers aborts only that response', { timeout: 3000 }, async t => {
  const handler = await fixture(t, () => {
    const stream = new PassThrough();
    queueMicrotask(() => {
      stream.emit('open');
      stream.destroy(new Error('mid-stream failure'));
    });
    return stream;
  });
  const result = await request(handler, '/');
  assert.equal(result.status, 200);
  assert.equal(result.error.message, 'mid-stream failure');
});
