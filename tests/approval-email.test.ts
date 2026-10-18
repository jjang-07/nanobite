import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, migrate, insertPr, updatePr, getPr } from '../src/db/db.ts';
import { buildApprovalEmail, parseDecision } from '../src/gates/approval.ts';
import { createPrimitiveClient } from '../src/primitive/client.ts';
import { loadConfig } from '../src/config.ts';
const config = loadConfig({ APPROVER_NAME: 'TK' });
function row(draft: string) {
    const db = openDb(':memory:'); migrate(db);
    insertPr(db, { id: 'cpr_mail', state: 'awaiting_approval', requester_identity: 'yunha-agent@fair-fly.primitive.email', responder_identity: 'sdk-help@fair-fly.primitive.email', topic: 'acme-sdk/retries', question: 'Why do concurrent retries create duplicate charges?', on_behalf_of: 'Yunha (startup)' });
    updatePr(db, 'cpr_mail', { draft_answer: draft, draft_flagged: JSON.stringify(['v2.5']), removals: JSON.stringify([{ placeholder: '[another customer]', count: 3 }, { placeholder: '[ticket]', count: 2 }]), matched_source_ids: JSON.stringify(['s1:1', 's1:2']) });
    return getPr(db, 'cpr_mail')!;
}
test('approval email: styled HTML puts the exact draft first, then the key facts as tags, then reply options', () => {
    const mail = buildApprovalEmail(row('Pass one idempotencyKey.\n\nconst k = randomUUID();'), config);
    const html = mail.bodyHtml;
    assert.match(html, /^<!doctype html>/i);
    const draftAt = html.indexOf('Pass one idempotencyKey.'), factsAt = html.indexOf('[another customer]'), replyAt = html.indexOf('approve always');
    assert.ok(draftAt > 0 && draftAt < factsAt && factsAt < replyAt, 'draft, then facts, then reply options');
    assert.match(html, /white-space:\s*pre-wrap/);
    for (const tag of ['[another customer] ×3', '[ticket] ×2', 'v2.5', 'acme-sdk/retries', 'cpr_mail'])
        assert.ok(html.includes(tag.replace('×', '&times;')) || html.includes(tag), tag);
    assert.doesNotMatch(html, /<script|box-shadow|gradient|<img/i);
    assert.match(mail.bodyText, /DRAFT ANSWER/, 'plain-text alternative remains');
    assert.equal(parseDecision('approve\n\n________________________________\nFrom: sdk-help@fair-fly.primitive.email').decision, 'approve');
});
test('approval email escapes the draft so source text can never inject markup', () => {
    const html = buildApprovalEmail(row('<script>alert(1)</script> & "quotes"'), config).bodyHtml;
    assert.ok(!html.includes('<script>alert'));
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quotes&quot;'));
});
test('the Primitive client sends the HTML part as body_html', async () => {
    let body: any;
    const client = createPrimitiveClient('prim_test', (async (_u: any, init: any) => { body = JSON.parse(init.body); return new Response(JSON.stringify({ success: true, data: { id: 's1', status: 'queued' } })); }) as typeof fetch);
    await client.sendMail({ from: 'a@x.primitive.email', to: 'b@y.com', subject: 's', bodyText: 'plain', bodyHtml: '<!doctype html><p>styled</p>', idempotencyKey: 'k' });
    assert.equal(body.body_text, 'plain');
    assert.equal(body.body_html, '<!doctype html><p>styled</p>');
});
