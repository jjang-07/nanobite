import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRules } from '../src/gates/rules.ts';
const rules = [
  { kind: 'literal', pattern: 'Northwind Traders', placeholder: '[another customer]' },
  { kind: 'literal', pattern: 'Northwind', placeholder: '[another customer]' },
  { kind: 'regex', pattern: '\\bACME-\\d{3,6}\\b', placeholder: '[ticket]' },
  { kind: 'regex', pattern: '[\\w.+-]+@[\\w-]+\\.[\\w.-]+', placeholder: '[email]' },
  { kind: 'sentence', pattern: 'charges a day', placeholder: '[internal]' },
] as const;
test('literals longest first, counts aggregated', () => {
  const r = applyRules('Northwind Traders hit it. Northwind again (ACME-4821).', [...rules]);
  assert.equal(r.text, '[another customer] hit it. [another customer] again ([ticket]).');
  assert.deepEqual(r.removals, [{ placeholder: '[another customer]', count: 2 }, { placeholder: '[ticket]', count: 1 }]);
});
test('sentence rule removes the whole sentence', () => {
  const r = applyRules('Fix: pass one key. They do about 40k charges a day and the CTO is furious. Done.', [...rules]);
  assert.equal(r.text, 'Fix: pass one key. [sentence removed: [internal]] Done.');
});
test('the fix line survives intact', () => {
  const fix = 'Upgrade to 2.4.0 and call withRetry(fn, { preserveIdempotencyKey: true }) for Northwind-style timeouts.';
  const r = applyRules(fix, [...rules]);
  assert.match(r.text, /withRetry\(fn, \{ preserveIdempotencyKey: true \}\)/);
});
test('emails are masked', () => { assert.equal(applyRules('mail cto@northwind.example now', [...rules]).text, 'mail [email] now'); });
