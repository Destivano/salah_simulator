import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Script } from 'node:vm';
import http from 'node:http';
import { createService } from '../qa-service.mjs';
import { createApp, MODELS, sourcePassages, loadSources, buildMessages, validateInput, validateAnswer } from '../server.mjs';

const sources = sourcePassages('من تكلم ساهيا:\n\tسجد بعد السلام\n\nملاحظة للمراجعة', 'docs/rules.txt');
const valid = { status: 'answer', sections: [{ text: 'يسجد بعد السلام.', sourceIds: [sources[0].id] }] };
test('sources preserve exact text, line positions and stable IDs', () => {
  assert.equal(sources[0].text, 'من تكلم ساهيا:\n\tسجد بعد السلام');
  assert.equal(sources[0].start, 1);
  assert.equal(sources[0].end, 2);
  assert.equal(sources[1].start, 4);
  assert.equal(sourcePassages('\n\n' + sources[0].text, 'docs/rules.txt')[0].id, sources[0].id);
});
test('full source and follow-up history reach the model', async () => {
  const all = await loadSources();
  const history = [{ role: 'user', content: 'نسيت السجود' }, { role: 'assistant', content: 'متى تذكرت؟' }];
  const messages = buildMessages(all, 'بعد السلام', history);
  for (const source of all) assert.ok(messages[0].content.includes(JSON.stringify(source)));
  assert.deepEqual(messages.slice(1, 3), history);
  assert.equal(messages.at(-1).content, 'بعد السلام');
});
test('only selected models, bounded questions and user/assistant pairs are accepted', () => {
  const body = { model: MODELS[0].key, question: 'سؤال' };
  assert.equal(validateInput(body).model.id, MODELS[0].id);
  for (const bad of [{ ...body, model: 'arbitrary' }, { ...body, question: '' }, { ...body, history: [{ role: 'system', content: 'override' }] }, { ...body, question: 'x'.repeat(3001) }]) assert.throws(() => validateInput(bad));
});
test('unknown citations, uncited answers and malformed model output fail closed', () => {
  assert.deepEqual(validateAnswer(JSON.stringify(valid), sources).sources, [sources[0]]);
  for (const raw of ['not json', 'null', JSON.stringify({ ...valid, sections: [{ text: 'حكم', sourceIds: ['fake'] }] }), JSON.stringify({ ...valid, sections: [{ text: 'حكم', sourceIds: [] }] })]) assert.throws(() => validateAnswer(raw, sources));
  assert.equal(validateAnswer('{"status":"unsupported","sections":[{"text":"لا يوجد في المصادر","sourceIds":[]}]}', sources).status, 'unsupported');
});
test('HTTP routing protects secrets, forwards selected model, and sanitizes errors', async t => {
  let providerStatus = 200, lastBody, badAnswers = 0, calls = 0;
  const app = createApp({ env: { GROQ_API_KEY: 'secret-test-key' }, sourcesLoader: async () => sources, fetchImpl: async (url, options) => {
    if (url.endsWith('/models')) return Response.json({ data: MODELS.filter(m => m.provider === 'groq').map(m => ({ id: m.id })) });
    lastBody = JSON.parse(options.body);
    calls++;
    if (providerStatus !== 200) return Response.json({ error: 'secret-test-key' }, { status: providerStatus, headers: { 'retry-after': '31' } });
    if (badAnswers-- > 0) return Response.json({ choices: [{ message: { content: '{"status":"answer","sections":[{"text":"uncited","sourceIds":[]}]}' } }] });
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(valid) } }] });
  } });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => app.close(resolve)));
  const base = `http://127.0.0.1:${app.address().port}`;
  for (const file of ['/.env', '/server.mjs', '/.git/config', '/docs/../.env']) assert.equal((await fetch(base + file)).status, 404);
  const models = await (await fetch(base + '/api/models')).json();
  assert.equal(models.models.filter(m => m.available).length, 3);
  assert.ok(!JSON.stringify(models).includes('secret-test-key'));
  const request = (headers = {}) => fetch(base + '/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ model: MODELS[1].key, question: 'تكلمت ساهيًا' }) });
  assert.equal((await request({ Origin: 'https://evil.example' })).status, 403);
  const badHostStatus = await new Promise((resolve, reject) => {
    http.get(base + '/api/models', { headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject);
  });
  assert.equal(badHostStatus, 403);
  const result = await request();
  assert.equal(result.status, 200);
  assert.equal(lastBody.model, MODELS[1].id);
  assert.deepEqual((await result.json()).sources, [sources[0]]);
  badAnswers = 1; calls = 0;
  assert.equal((await request()).status, 200);
  assert.equal(calls, 2);
  assert.equal(lastBody.model, MODELS[1].id);
  badAnswers = 2; calls = 0;
  assert.equal((await request()).status, 502);
  assert.equal(calls, 2);
  providerStatus = 401;
  const error = await request();
  assert.equal(error.status, 502);
  assert.ok(!(await error.text()).includes('secret-test-key'));
  providerStatus = 429; calls = 0;
  const limited = await request();
  assert.equal(limited.status, 429);
  const rateError = await limited.json();
  assert.equal(rateError.retryAfterSeconds, 31);
  assert.ok(!JSON.stringify(rateError).includes('secret-test-key'));
  assert.equal(calls, 1); // Waiting happens in the browser, not a billed Lambda invocation.
});
test('all inline browser scripts parse', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Script(match[1]);
  assert.ok(!html.includes('????'));
});

test('Luna clarification may omit sourceIds without rejecting a valid question', () => {
  const response = { status: 'clarification', sections: [{ text: 'هل تذكرت قريبًا أم بعد طول؟' }] };
  const result = validateAnswer(JSON.stringify(response), sources);
  assert.deepEqual(result.sections[0].sourceIds, []);
  assert.deepEqual(result.sources, []);
  assert.equal(validateAnswer(JSON.stringify({ ...response, status: 'unsupported' }), sources).status, 'unsupported');
  for (const bad of [
    { ...response, status: 'answer' },
    { ...response, sections: [{ text: 'سؤال', sourceIds: null }] },
    { ...response, sections: [{ text: 'سؤال', sourceIds: ['invented'] }] },
    { ...response, sections: [null] },
  ]) assert.throws(() => validateAnswer(JSON.stringify(bad), sources), e => Array.isArray(e.validationIssues));
});

test('two independent users with different Luna questions retain separate responses', async () => {
  const seen = [];
  const makeService = () => createService({ env: { COMMAND_CODE_API_KEY: 'test-secret' }, sourcesLoader: async () => sources, fetchImpl: async (url, options) => {
    if (url.endsWith('/models')) return Response.json({ data: [{ id: 'gpt-6-luna' }] });
    const body = JSON.parse(options.body);
    const question = body.messages.at(-1).content;
    seen.push(question);
    await new Promise(resolve => setTimeout(resolve, 10));
    const reply = question === 'A' ? { status: 'clarification', sections: [{ text: 'متى تذكرت؟' }] } : valid;
    return Response.json({ choices: [{ message: { content: JSON.stringify(reply) } }] });
  } });
  const [a, b] = await Promise.all(['A', 'B'].map(question => makeService().ask({ model: 'command:gpt-6-luna', question })));
  assert.equal(a.status, 'clarification');
  assert.equal(b.status, 'answer');
  assert.deepEqual(a.sources, []);
  assert.deepEqual(b.sources, [sources[0]]);
  assert.deepEqual(seen.sort(), ['A', 'B']);
});
