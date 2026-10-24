// Optional: PLAYWRIGHT_MODULE points to an installed Playwright package entry.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { MODELS } from '../qa-service.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const calls = [];
  let alwaysLimited = false;
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  await page.route('http://127.0.0.1:4173/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
    if (url.pathname === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: 'window.SAHW_CONFIG={};' });
    if (url.pathname === '/api/models') return route.fulfill({ json: { models: [{ ...MODELS[0], available: true }] } });
    calls.push(route.request().postDataJSON());
    if (calls.length === 2 || alwaysLimited) return route.fulfill({ status: 429, json: { error: 'حد الاستخدام', retryAfterSeconds: 1 } });
    return route.fulfill({ json: { status: 'answer', model: 'Test', sections: [{ text: 'جواب تجريبي', sourceIds: [] }], sources: [] } });
  });
  await page.goto('http://127.0.0.1:4173/#other');
  await page.waitForFunction(() => !document.getElementById('qaSend').disabled);
  for (const q of ['السؤال الأول', 'سؤال المتابعة']) {
    await page.locator('#qaQuestion').fill(q);
    await page.locator('#qaSend').click();
    await page.waitForFunction(() => !document.getElementById('qaSend').disabled);
  }
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[1], calls[2]);
  assert.equal(calls[2].history.length, 2);
  assert.equal(await page.locator('.qa-turn').count(), 2);
  alwaysLimited = true;
  await page.locator('#qaQuestion').fill('احتفظ بهذا السؤال');
  await page.locator('#qaSend').click();
  await page.waitForFunction(() => !document.getElementById('qaSend').disabled);
  assert.equal(calls.length, 5); // Exactly one retry; no infinite loop.
  assert.equal(await page.locator('.qa-turn').count(), 2);
  assert.equal(await page.locator('#qaQuestion').inputValue(), 'احتفظ بهذا السؤال');
  console.log('PASS rate-limit retry preserves follow-up, history and unsent question; retries are bounded');
} finally { await browser.close(); }
