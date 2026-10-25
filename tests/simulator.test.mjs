import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const logic = html.split('/*LOGIC-START*/')[1].split('/*LOGIC-END*/')[0];
const { computeVerdict, STAGES } = new Function(logic + '; return {computeVerdict,STAGES};')();
const stage = (rakaa, type) => STAGES.find(s => s.rakaa === rakaa && s.type === type).id;
test('existing simulator boundaries: recovery, replacement, third rakaa and salam', () => {
  const cases = [
    ['sajda', 1, 'sujud', 2, 'ruku', 'recover'],
    ['sajda', 1, 'sujud', 2, 'raf3', 'before'],
    ['sajda', 2, 'sujud', 3, 'ruku', 'recover'],
    ['sajda', 2, 'sujud', 3, 'raf3', 'after'],
    ['sajda', 1, 'sujud', 3, 'ruku', 'before'],
    ['sajda', 1, 'sujud', 3, 'raf3', 'after'],
    ['ruku', 1, 'ruku', 2, 'qiyam', 'recover'],
    ['ruku', 1, 'ruku', 2, 'huwiy', 'before'],
    ['ruku', 1, 'ruku', 3, 'qiyam', 'before'],
    ['ruku', 1, 'ruku', 3, 'huwiy', 'after'],
    ['ruku', 2, 'ruku', 3, 'qiyam', 'recover'],
    ['ruku', 2, 'ruku', 3, 'huwiy', 'after'],
    ['fatiha', 1, 'qiyam', 2, 'ruku', 'recover'],
    ['fatiha', 1, 'qiyam', 2, 'raf3', 'before'],
    ['fatiha', 1, 'qiyam', 3, 'raf3', 'after'],
  ];
  for (const [rukn, fr, ft, rr, rt, kind] of cases) assert.equal(computeVerdict(rukn, stage(fr, ft), stage(rr, rt)).kind, kind, JSON.stringify([rukn, fr, rr, rt]));
  for (const [rukn, type] of [['sajda', 'sujud'], ['ruku', 'ruku'], ['fatiha', 'qiyam']]) {
    assert.equal(computeVerdict(rukn, stage(4, type), stage(4, 'sujud')).kind, 'recover');
    for (let r = 1; r <= 4; r++) assert.equal(computeVerdict(rukn, stage(r, type), stage(5, 'salam')).kind, 'batil');
  }
});
test('incomplete or reversed selections do not produce a result', () => {
  assert.equal(computeVerdict(null, null, null), null);
  assert.equal(computeVerdict('sajda', 4, null), null);
  assert.equal(computeVerdict('sajda', 4, 3), null);
});
