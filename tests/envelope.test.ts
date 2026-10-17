import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeEnvelope, parseEnvelope, prIdFromSubject } from '../src/envelope.ts';

test('envelope round-trips inside prose', () => {
  const body = 'Hello Bob,\n\n' + encodeEnvelope('request', { v: 1, id: 'cpr_abc123', topic: 'acme-sdk/retries' }) + '\n\nthanks';
  const parsed = parseEnvelope(body);
  assert.equal(parsed?.kind, 'request'); assert.equal(parsed?.payload.id, 'cpr_abc123');
});
test('parseEnvelope returns null without a block or with broken json', () => {
  assert.equal(parseEnvelope('no block here'), null);
  assert.equal(parseEnvelope('--- contextpr-json ---\n{oops\n--- end ---'), null);
  assert.equal(parseEnvelope(null), null);
});
test('prIdFromSubject', () => {
  assert.equal(prIdFromSubject('Re: [ContextPR cpr_m2k9a1x7] acme-sdk/retries'), 'cpr_m2k9a1x7');
  assert.equal(prIdFromSubject('hello'), null);
});
