import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

const types = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml' };
const contained = (root, file) => {
  const path = relative(root, file);
  return path !== '..' && !path.startsWith('../') && !isAbsolute(path);
};
const fail = (response, status) => {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(status === 400 ? 'Bad request' : status === 404 ? 'Not found' : 'Unable to read file');
};

// Export the handler so error paths can also be exercised without opening a socket.
export function createRequestHandler(root, openStream = createReadStream) {
  const rootPath = realpath(root);
  return async (request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      if (pathname.includes('\0')) throw new Error('Invalid path');
    } catch {
      fail(response, 400);
      return;
    }
    try {
      const base = await rootPath;
      const file = resolve(base, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!contained(base, file)) { fail(response, 404); return; }
      const canonical = await realpath(file);
      if (!contained(base, canonical) || !(await stat(canonical)).isFile()) { fail(response, 404); return; }
      const headers = { 'Content-Type': `${types[extname(canonical)] || 'application/octet-stream'}; charset=utf-8` };
      if (request.method === 'HEAD') { response.writeHead(200, headers); response.end(); return; }
      const stream = openStream(canonical);
      stream.on('error', error => {
        if (response.headersSent) response.destroy(error);
        else fail(response, ['ENOENT', 'ENOTDIR'].includes(error.code) ? 404 : 500);
      });
      response.on('close', () => stream.destroy());
      // Wait until the file is open: a file can disappear after stat succeeds.
      stream.once('open', () => {
        response.writeHead(200, headers);
        stream.pipe(response);
      });
    } catch (error) {
      fail(response, ['ENOENT', 'ENOTDIR'].includes(error.code) ? 404 : 500);
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const server = createServer(createRequestHandler(process.cwd()));
  const port = Number(process.env.PORT || 3000);
  server.on('error', error => {
    console.error(`開発サーバーを起動できません: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Wastewater Wizard: http://127.0.0.1:${server.address().port}`);
  });
}
