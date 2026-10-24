import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../lambda.mjs';
import { createService, MODELS, loadSources } from '../qa-service.mjs';

const origin = 'https://destivano.github.io';
function event(method = 'GET', path = '/api/models', body) {
  return { version: '2.0', rawPath: path, headers: { origin, 'content-type': 'application/json' }, requestContext: { http: { method } }, body, isBase64Encoded: false };
}
test('Function URL CORS preflight and origin rejection', async () => {
  const handler = createHandler({ service: { availableModels: async () => [] } });
  const preflight = await handler(event('OPTIONS', '/api/ask'));
  assert.equal(preflight.statusCode, 204);
  assert.equal(preflight.headers['Access-Control-Allow-Origin'], origin);
  for (const bad of [undefined, 'null', 'https://evil.example', origin + '.evil.example']) {
    const input = event(); input.headers.origin = bad;
    const result = await handler(input);
    assert.equal(result.statusCode, 403);
    assert.equal(result.headers['Access-Control-Allow-Origin'], undefined);
  }
});
test('Lambda serves model list and handles base64 Arabic JSON', async () => {
  let received;
  const handler = createHandler({ service: { availableModels: async () => MODELS, ask: async body => { received = body; return { status: 'clarification' }; } } });
  assert.equal(JSON.parse((await handler(event())).body).models.length, 7);
  const body = { model: MODELS[0].key, question: 'نسيت السجود' };
  const input = event('POST', '/api/ask', Buffer.from(JSON.stringify(body)).toString('base64'));
  input.isBase64Encoded = true;
  assert.equal((await handler(input)).statusCode, 200);
  assert.deepEqual(received, body);
});
test('Lambda rejects bad methods, files, body sizes and malformed JSON', async () => {
  const handler = createHandler({ service: {} });
  assert.equal((await handler(event('GET', '/.env'))).statusCode, 404);
  assert.equal((await handler(event('DELETE', '/api/ask'))).statusCode, 405);
  assert.equal((await handler(event('POST', '/api/ask', '{'))).statusCode, 400);
  assert.equal((await handler(event('POST', '/api/ask', 'x'.repeat(270001)))).statusCode, 413);
  const input = event('POST', '/api/ask', '{}'); input.headers['content-type'] = 'text/plain';
  assert.equal((await handler(input)).statusCode, 415);
});
test('Lambda integrates shared service, real sources and sanitized errors', async () => {
  const sources = await loadSources();
  let outgoing;
  const service = createService({ env: { GROQ_API_KEY: 'test-secret' }, fetchImpl: async (url, options) => {
    if (url.endsWith('/models')) return Response.json({ data: [{ id: MODELS[0].id }] });
    outgoing = JSON.parse(options.body);
    return Response.json({ choices: [{ message: { content: JSON.stringify({ status: 'answer', sections: [{ text: 'سجد بعد السلام', sourceIds: [sources[0].id] }] }) } }] });
  } });
  const handler = createHandler({ service });
  const response = await handler(event('POST', '/api/ask', JSON.stringify({ model: MODELS[0].key, question: 'تكلمت سهوا' })));
  assert.equal(response.statusCode, 200);
  assert.equal(outgoing.model, MODELS[0].id);
  assert.equal(JSON.parse(response.body).sources[0].text, sources[0].text);
  assert.ok(!response.body.includes('test-secret'));
  const failed = createHandler({ service: { availableModels: async () => { throw new Error('test-secret'); } } });
  assert.ok(!(await failed(event())).body.includes('test-secret'));
});
