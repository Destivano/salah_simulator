// Opt-in, paid provider smoke test. Run against npm start: node tests/live-qa.mjs
import { MODELS } from '../server.mjs';
for (const model of MODELS) {
  const start = Date.now();
  try {
    const response = await fetch('http://127.0.0.1:3000/api/ask', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model.key, question: 'تكلمت ساهيًا في الصلاة، ماذا أفعل؟' }),
      signal: AbortSignal.timeout(110000),
    });
    const data = await response.json();
    console.log(JSON.stringify({ model: model.id, http: response.status, seconds: Math.round((Date.now() - start) / 1000), answer: data.sections, citations: data.sources?.length, error: data.error }));
    if (!response.ok || data.status !== 'answer' || !data.sources?.length) process.exitCode = 1;
  } catch (error) { console.log(model.id, error.name); process.exitCode = 1; }
}
