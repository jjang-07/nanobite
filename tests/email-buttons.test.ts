import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, migrate, insertPr, updatePr, getPr, listEvents } from '../src/db/db.ts';
import { buildApprovalEmail } from '../src/gates/approval.ts';
import { setup, queued, incoming, config } from './helpers.ts';
import { pollInbound, processReceived } from '../src/pipeline/responder.ts';
const cfg = { ...config, APPROVER_NAME: 'TK' };
function row() {
    const db = openDb(':memory:'); migrate(db);
    insertPr(db, { id: 'cpr_btn1', state: 'awaiting_approval', requester_identity: 'yunha-agent@fair-fly.primitive.email', responder_identity: 'sdk-help@fair-fly.primitive.email', topic: 'acme-sdk/retries', question: 'Why do concurrent retries create duplicate charges?', on_behalf_of: 'Yunha (startup)' });
    updatePr(db, 'cpr_btn1', { draft_answer: 'Pass one idempotencyKey outside withRetry().', draft_summary: 'Each retry looks like a new payment. Reuse one key.', draft_flagged: JSON.stringify(['v2.5']), removals: JSON.stringify([{ placeholder: '[ticket]', count: 2 }]), matched_source_ids: JSON.stringify(['s1:1', 's1:2']) });
    return getPr(db, 'cpr_btn1')!;
}
const mailtos = (html: string) => [...html.matchAll(/href="(mailto:[^"]+)"/g)].map(m => new URL(m[1].replace(/&amp;/g, '&')));
test('approval email: plain summary, exact answer, then Approve / Deny / Edit buttons that compose the reply', () => {
    const html = buildApprovalEmail(row(), cfg).bodyHtml;
    assert.match(html, /Nanobite/); assert.doesNotMatch(html, /ContextPR/);
    const at = (s: string) => html.indexOf(s);
    assert.ok(at('Each retry looks like a new payment') < at('Pass one idempotencyKey') && at('Pass one idempotencyKey') < at('>Approve<'), 'summary, then exact answer, then buttons');
    const links = mailtos(html);
    const byBody = Object.fromEntries(links.map(u => [decodeURIComponent(u.searchParams.get('body') ?? '').split(/\r?\n/)[0], u]));
    for (const cmd of ['approve', 'deny', 'edit', 'approve always']) {
        const u = byBody[cmd];
        assert.ok(u, `button for ${cmd}`);
        assert.equal(decodeURIComponent(u.pathname), 'sdk-help@fair-fly.primitive.email');
        assert.match(decodeURIComponent(u.searchParams.get('subject') ?? ''), /\[Nanobite cpr_btn1\]/);
    }
    assert.match(decodeURIComponent(byBody.edit.searchParams.get('body')!), /Pass one idempotencyKey outside withRetry\(\)\./, 'edit opens a draft holding the current answer');
    assert.doesNotMatch(html, /Reply with one of these/i);
    assert.match(html, /<details[\s\S]*Masked by rules[\s\S]*\[ticket\][\s\S]*Built from[\s\S]*cpr_btn1[\s\S]*<\/details>/, 'secondary facts are collapsed');
    assert.match(html, /v2\.5/, 'flags stay visible');
});
test('a decision composed by a button (a fresh email, not a threaded reply) is accepted only from the approver with DMARC', async () => {
    const s = setup();
    const id = queued(s.db);
    s.mail.deliverInbound(incoming(id));
    await pollInbound(s.db, s.deps);
    await processReceived(s.db, s.deps);
    assert.equal(getPr(s.db, id)!.state, 'awaiting_approval');
    const fresh = (n: number, from: string, body: string, dmarcPass = true, subject = `Re: [Nanobite ${id}] Approve answer`) =>
        s.mail.deliverInbound({ id: `fresh_${n}`, fromEmail: from, toEmail: config.RESPONDER_IDENTITY, subject, bodyText: body, dmarcPass });
    fresh(1, 'mallory@evil.example', 'approve');
    fresh(2, config.APPROVER_EMAIL, 'approve', false);
    await pollInbound(s.db, s.deps);
    assert.equal(getPr(s.db, id)!.state, 'awaiting_approval', 'wrong sender and failed DMARC are refused');
    assert.equal(listEvents(s.db, id).filter(e => e.kind === 'reply_ignored').length, 2);
    fresh(3, `TK <${config.APPROVER_EMAIL.toUpperCase()}>`, 'edit\n\nReuse one key across retries.\n\nSent from my iPhone');
    await pollInbound(s.db, s.deps);
    const p = getPr(s.db, id)!;
    assert.equal(p.state, 'approved'); assert.equal(p.decision, 'edit'); assert.equal(p.approved_text, 'Reuse one key across retries.');
    fresh(4, config.APPROVER_EMAIL, 'deny');
    await pollInbound(s.db, s.deps);
    assert.equal(getPr(s.db, id)!.decision, 'edit', 'a later email cannot change a finished decision');
});
test('email labels are short, sections breathe, and Details is collapsed by default', () => {
    const html = buildApprovalEmail(row(), cfg).bodyHtml;
    for (const label of ['>Summary<', '>Exact answer<', '>Flagged for you<'])
        assert.ok(html.includes(label), label);
    assert.doesNotMatch(html, /In plain words|word for word|model thinks/);
    // Collapsed everywhere: the content is hidden inline and only an [open] details element reveals it.
    assert.match(html, /<style>[^<]*details\[open\][^<]*<\/style>/);
    assert.match(html, /<div class="nb-dc" style="display:none[^"]*mso-hide:all/);
    assert.match(html, /<summary class="nb-s" style="display:none/);
});
