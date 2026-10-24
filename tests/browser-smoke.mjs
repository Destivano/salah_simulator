// Optional UI check: set PLAYWRIGHT_MODULE to an installed playwright package path.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('http://127.0.0.1:3000/#other');
    await page.waitForFunction(() => !document.getElementById('qaSend').disabled);
    assert.equal(await page.locator('#qaModel option:not([disabled])').count(), 7);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.route('**/api/ask', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'answer', model: 'UI test', sections: [{ text: '<img src=x onerror=alert(1)> نص آمن', sourceIds: ['s-test'] }], sources: [{ id: 's-test', file: 'docs/rules.txt', start: 1, end: 2, text: 'النص الأصلي' }] }) }));
    await page.locator('#qaQuestion').fill('سؤال تجريبي');
    await page.locator('#qaSend').click();
    await page.locator('.qa-ref').click();
    assert.equal(await page.locator('.qa-turn details').getAttribute('open'), '');
    assert.equal(await page.locator('.qa-turn img').count(), 0);
    await page.locator('#qaReset').click();
    assert.equal(await page.locator('.qa-turn').count(), 0);
    await page.locator('#searchInput').fill('ضحكت وأنا أصلي');
    await page.waitForFunction(() => document.querySelectorAll('.result-card').length > 0);
    await page.locator('#btnPageArkan').click();
    assert.ok(await page.locator('#page-arkan').isVisible());
    await page.locator('.rukn-btn').first().click();
    await page.locator('.seg[data-selectable="true"]').first().click();
    await page.locator('.seg[data-selectable="true"]').last().click();
    assert.ok(await page.locator('#result').isVisible());
    console.log(`PASS desktop/mobile width ${width}`);
  }
  await page.goto(new URL('../index.html', import.meta.url).href + '#other');
  assert.ok(await page.locator('#qaSend').isDisabled());
  await page.locator('#searchInput').fill('ضحكت');
  await page.waitForFunction(() => document.querySelectorAll('.result-card').length > 0);
  assert.deepEqual(errors, []);
  console.log('PASS offline search and no browser errors');
} finally { await browser.close(); }
