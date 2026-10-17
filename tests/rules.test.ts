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
test('sentence filtering preserves line breaks in code and unrelated lines', () => {
    const input = 'const key = randomUUID();\nwithRetry(() => charge({idempotencyKey:key}));\nKeep this line.';
    assert.equal(applyRules(input, [...rules]).text, input);
});
test('single-word literals redact sentence punctuation without matching larger identifiers', () => {
    const result = applyRules('Northwind. (Northwind), .Northwind! Northwinding northwind_internal.', rules);
    assert.equal(result.text, '[another customer]. ([another customer]), .[another customer]! Northwinding northwind_internal.');
    assert.deepEqual(result.removals, [{ placeholder: '[another customer]', count: 3 }]);
});
test('literal redaction does not split customer names embedded in full email addresses', () => {
    const result = applyRules('Northwind. Northwind.smith@example.com and ops@northwind.example and Northwind-support@example.com', rules);
    assert.equal(result.text, '[another customer]. [email] and [email] and [email]');
    assert.deepEqual(result.removals, [{ placeholder: '[another customer]', count: 1 }, { placeholder: '[email]', count: 3 }]);
});
