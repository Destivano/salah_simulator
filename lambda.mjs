import { createService, PublicError, errorResponse } from './qa-service.mjs';

// Lambda Function URL / API Gateway HTTP API payload v2. No HTTP server or dependencies.
export function createHandler({ env = process.env, service = createService({ env }) } = {}) {
  const origins = new Set((env.ALLOWED_ORIGINS || 'https://destivano.github.io').split(',').map(s => s.trim()).filter(Boolean));
  return async event => {
    const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const origin = headers.origin;
    const allowed = origins.has(origin);
    const responseHeaders = {
      'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'Vary': 'Origin',
      ...(allowed ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' } : {}),
    };
    const respond = (statusCode, body) => ({ statusCode, headers: responseHeaders, body: statusCode === 204 ? '' : JSON.stringify(body), isBase64Encoded: false });
    try {
      if (!allowed) throw new PublicError(403, 'مصدر الطلب غير مسموح.');
      const method = event.requestContext?.http?.method;
      const route = event.rawPath;
      if (!['/api/models', '/api/ask'].includes(route)) return respond(404, { error: 'غير موجود.' });
      if (method === 'OPTIONS') return respond(204);
      if (method === 'GET' && route === '/api/models') return respond(200, { models: await service.availableModels() });
      if (method !== 'POST' || route !== '/api/ask') return respond(405, { error: 'طريقة الطلب غير مسموحة.' });
      if (!headers['content-type']?.startsWith('application/json')) throw new PublicError(415, 'نوع الطلب غير صالح.');
      if (typeof event.body !== 'string') throw new PublicError(400, 'الطلب غير صالح.');
      if (event.body.length > 270000) throw new PublicError(413, 'الطلب كبير جدًا.');
      const bytes = Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8');
      if (bytes.length > 200000) throw new PublicError(413, 'الطلب كبير جدًا.');
      let body;
      try { body = JSON.parse(bytes.toString('utf8')); } catch { throw new PublicError(400, 'الطلب غير صالح.'); }
      return respond(200, await service.ask(body));
    } catch (error) {
      const result = errorResponse(error);
      return respond(result.status, result.data);
    }
  };
}
export const handler = createHandler();
