// اختبار محرك البحث: يستخرج TOPICS ودوال البحث من index.html ويشغّلها دون متصفح
import fs from 'node:fs';
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const tStart = js.indexOf('const TOPICS=[');
const topics = js.slice(tStart, js.indexOf('];', tStart) + 2);
const engine = js.slice(js.indexOf('// تطبيع النص العربي'), js.indexOf('const VERDICT_ICON'));
const api = new Function(topics + '\n' + engine + '\nreturn {searchIssues, TOPICS};')();

const cases = [
  ['ضحكت وأنا أصلي', 'الضحك'],
  ['نسيتُ سجود السهو حتى سلّمت', 'السجود القبلي'],
  ['شككت هل صليت ثلاثا أم أربعا', 'كمال'],
  ['نمت نوما ثقيلا', 'الثقيل'],
  ['أدركت الإمام في التشهد فقط', 'أقلّ من ركعة'],
  ['تكلمت بالخطأ في صلاتي', 'تكلّم'],
  ['بالصلاة ضحك', 'الضحك'],
  ['ضهكت وانا اصلي', 'الضحك'],
  ['تثاءبت اثناء الصلاة', 'التثاؤب'],
];
let pass = 0;
for (const [q, expect] of cases) {
  const top = api.searchIssues(q).list[0]?.entry.q ?? '(لا نتائج)';
  const ok = top.includes(expect);
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + q + ' => ' + top);
  if (ok) pass++;
}
console.log(`${pass}/${cases.length}`);
process.exit(pass === cases.length ? 0 : 1);
