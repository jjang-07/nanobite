import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeEnvelope, parseEnvelope, prIdFromSubject } from '../src/envelope.ts';
test('envelope round-trips inside prose', () => {
    const body = 'Hello TK,\n\n' + encodeEnvelope('request', { v: 1, id: 'cpr_abc123', topic: 'acme-sdk/retries' }) + '\n\nthanks';
    const parsed = parseEnvelope(body);
    assert.equal(parsed?.kind, 'request');
    assert.equal(parsed?.payload.id, 'cpr_abc123');
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
test('delimiter words inside JSON strings remain payload data', () => {
    const text = 'Use --- end --- literally, and mention --- contextpr-json --- in the answer.\n--- end ---';
    const body = encodeEnvelope('capsule', { v: 1, id: 'cpr_data', text });
    assert.equal(parseEnvelope(body)?.payload.text, text);
});
test('only complete delimiter lines frame an envelope', () => {
    const json = JSON.stringify({ v: 1, kind: 'request', id: 'cpr_inline' });
    assert.equal(parseEnvelope(`Prose says --- contextpr-json ---\n${json}\n--- end ---`), null);
    assert.equal(parseEnvelope(`--- contextpr-json ---\n${json}\nProse says --- end ---`), null);
    assert.equal(parseEnvelope(`--- contextpr-json --- trailing text\n${json}\n--- end ---`), null);
});
test('whole-line email quoting and CRLF still preserve valid envelopes', () => {
    const body = encodeEnvelope('capsule', { v: 1, id: 'cpr_quote', text: 'Example --- end --- remains data.' }).split('\n').map(line => '> ' + line).join('\r\n');
    assert.equal(parseEnvelope(body)?.payload.text, 'Example --- end --- remains data.');
});
