import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createService, PublicError, errorResponse } from './qa-service.mjs';
export { MODELS, sourcePassages, loadSources, buildMessages, validateInput, validateAnswer } from './qa-service.mjs';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
export function createApp(options = {}) {
  const service = createService(options);
  return http.createServer(async (req, res) => {
    const send = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify(data));
    };
    try {
      if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '')) throw new PublicError(403, 'عنوان غير مسموح.');
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) throw new PublicError(403, 'مصدر الطلب غير مسموح.');
      const url = new URL(req.url, `http://${req.headers.host}`);
      const files = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/config.js': ['config.js', 'text/javascript'] };
      if (req.method === 'GET' && Object.hasOwn(files, url.pathname)) {
        const [file, type] = files[url.pathname];
        res.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        return res.end(await readFile(path.join(ROOT, file)));
      }
      if (req.method === 'GET' && url.pathname === '/api/models') return send(200, { models: await service.availableModels() });
      if (req.method !== 'POST' || url.pathname !== '/api/ask') return send(404, { error: 'غير موجود.' });
      if (!req.headers['content-type']?.startsWith('application/json')) throw new PublicError(415, 'نوع الطلب غير صالح.');
      const chunks = [];
      let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 200000) throw new PublicError(413, 'الطلب كبير جدًا.');
        chunks.push(chunk);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new PublicError(400, 'الطلب غير صالح.'); }
      return send(200, await service.ask(body));
    } catch (error) {
      const result = errorResponse(error);
      send(result.status, result.data);
    }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const server = createApp();
  server.on('error', () => { console.error('تعذّر تشغيل الخادم. تحقق من المنفذ.'); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${server.address().port}/#other`));
}
