import { mkdir, copyFile, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const output = new URL('dist/site/', root);
await mkdir(output, { recursive: true });
await copyFile(new URL('index.html', root), new URL('index.html', output));
// Deliberate allowlist: never publish the repository root, sources, backend or .env.
let config = await readFile(new URL('config.js', root), 'utf8');
if (process.env.QA_API_URL?.trim()) {
  const url = new URL(process.env.QA_API_URL.trim());
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('QA_API_URL must be an HTTPS Function URL origin, with no credentials or path.');
  config = `window.SAHW_CONFIG = ${JSON.stringify({ apiBaseUrl: url.origin })};\n`;
}
await writeFile(new URL('config.js', output), config);
await writeFile(new URL('.nojekyll', output), '');
console.log('Static site: ' + fileURLToPath(output));
