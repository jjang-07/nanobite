import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { openDb, migrate, insertPr, getPr, updatePr } from '../src/db/db.ts';
import { renderInbox, renderPr, renderError } from '../src/dashboard/render.ts';
import { loadConfig } from '../src/config.ts';
import type { LocalInboxMessage } from '../src/primitive/local.ts';
function sample() { const db = openDb(':memory:'); migrate(db); insertPr(db, { id: 'cpr_demo', state: 'awaiting_approval', requester_identity: 'yunha@startup.local', responder_identity: 'sdk@acme.local', topic: 'sdk/retries', question: 'Why do retries create duplicate charges?' }); updatePr(db, 'cpr_demo', { draft_answer: 'Use one key.\nUnreleased line.', approved_text: 'Use one key.\nApproved change.', draft_flagged: '["v2.5"]', removals: '[{"placeholder":"[another customer]","count":2}]', matched_source_ids: '["session:3"]', approval_sent_email_id: 'sent_approval', request_sent_email_id: 'sent_request', request_thread_id: 'thread_request', decision: 'edit', approver: 'tk@acme.local', outcome_result: 'passed' }); const pr = getPr(db, 'cpr_demo')!; db.close(); return pr; }
function message(purpose = 'approval'): LocalInboxMessage { return { id: 'in_approval', sentEmailId: 'sent_approval', purpose, reply: null, threadId: 'thread1', sender: 'sdk@acme.local', recipient: 'tk@acme.local', fromEmail: 'sdk@acme.local', toEmail: 'tk@acme.local', subject: '[ContextPR cpr_demo] Review', bodyText: 'Review exact draft', bodyHtml: null, receivedAt: '2026-10-17T20:00:00Z', snippet: null, fyi: false, automated: false, replyToSentEmailId: null, inReplyTo: [], references: [], attachments: [] }; }
const config = loadConfig({});
test('Inbox includes complete review table and explicit local request form', () => {
    const html = renderInbox([sample()], { csrfToken: 'safe-token', config });
    for (const value of ['cpr_demo', 'awaiting_approval', 'sdk/retries', '/pr/cpr_demo', 'Requester', 'Responder', 'Decision', 'Removals', 'Outcome', 'Updated', 'Local inbox', 'Ollama', 'Synthetic fixture demo'])
        assert.ok(html.includes(value), value);
    assert.match(html, /<form[^>]+action="\/requests"/);
    assert.match(html, /name="csrf" value="safe-token"/);
    for (const name of ['responder', 'topic', 'question', 'context', 'on_behalf_of'])
        assert.ok(html.includes(`name="${name}"`));
    assert.doesNotMatch(html, /<meta[^>]+http-equiv="refresh"/i);
    assert.match(html, /dirty/);
});
test('PR detail contains exact content, audit data, line changes and approval actions', () => {
    const pr = sample();
    const html = renderPr(pr, [{ id: 1, pr_id: pr.id, at: pr.created_at, kind: 'drafted', detail: '{"model":"demo"}' }], { csrfToken: 'csrf', config, messages: [message()] });
    for (const value of [pr.question, 'Use one key.\nUnreleased line.', 'Approved change.', '[another customer]', '×2', 'v2.5', 'session:3', 'drafted', 'sent_request', 'thread_request', 'passed'])
        assert.ok(html.includes(value), value);
    assert.match(html, /<del>Unreleased line\.<\/del>/);
    assert.match(html, /action="\/pr\/cpr_demo\/reply"/);
    assert.match(html, /name="sent_id" value="sent_approval"/);
    for (const action of ['approve', 'approve_always', 'deny', 'edit'])
        assert.ok(html.includes(`value="${action}"`));
    assert.match(html, /name="replacement"/);
    assert.match(html, /name="reason"/);
    assert.doesNotMatch(html, /http-equiv="refresh"|setInterval\(/i);
});
test('review hierarchy foregrounds the question and exact draft; evidence stays collapsed', () => {
    const pr = sample();
    const html = renderPr(pr, [], { config, messages: [message()] });
    assert.match(html, /<h1[^>]*>Why do retries create duplicate charges\?<\/h1>/);
    assert.doesNotMatch(html, /<h1[^>]*>cpr_demo<\/h1>|class="eyebrow"|clamp\(/);
    assert.ok(html.indexOf('Draft answer') < html.indexOf('Technical evidence'));
    assert.match(html, /<details class="evidence"[^>]*><summary>Technical evidence<\/summary>/);
    assert.match(html, /Ready for your review/);
    assert.match(html, /Rules/);
    assert.match(html, /Minimize/);
    assert.match(html, /Human/);
    assert.match(html, /The answer stays here until you submit a decision\./);
    assert.doesNotMatch(html, /font-size:11px/);
    assert.match(html, /data-refresh/);
    assert.match(html, /if\(dirty\)/);
    assert.match(html, /aria-busy/);
    assert.match(html, /min-height:44px/);
    assert.match(html, /@media\(max-width:760px\)/);
});
test('empty and failed states provide a clear next step; error pages reject external return links', () => {
    const inbox = renderInbox([], { config, csrfToken: 'token' });
    assert.match(inbox, /Ask your first question/);
    assert.match(inbox, /href="#new-request"/);
    const failed = renderPr({ ...sample(), state: 'failed' }, [], { config });
    assert.match(failed, /Request stopped/);
    assert.match(failed, /Create a new request/);
    assert.match(renderPr({ ...sample(), state: 'denied' }, [], { config }), /This request was declined or no matching source was available\. No answer was shared\./);
    const error = renderError('Request unavailable', '<script>bad()</script>', 'javascript:alert(1)', { config });
    assert.match(error, /<h1>Request unavailable<\/h1>/);
    assert.match(error, /&lt;script&gt;bad\(\)&lt;\/script&gt;/);
    assert.match(error, /href="\/"/);
    assert.doesNotMatch(error, /javascript:|<script>bad/);
});
test('refresh keeps edits and busy feedback preserves action values and recovers on browser back', () => {
    const html = renderPr(sample(), [], { config, messages: [message()] });
    const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
    const listeners: Record<string, Function> = {}, formListeners: Record<string, Function> = {}, linkListeners: Record<string, Function> = {}, windowListeners: Record<string, Function> = {};
    const attributes: Record<string, string> = {};
    const button = { dataset: {} as Record<string, string>, textContent: 'Approve draft', value: 'approve', disabled: false, setAttribute: (name: string, value: string) => { attributes[name] = value; }, removeAttribute: (name: string) => { delete attributes[name]; } };
    const form = { dataset: {} as Record<string, string>, setAttribute: button.setAttribute, removeAttribute: button.removeAttribute, querySelectorAll: () => [button], addEventListener: (name: string, handler: Function) => { formListeners[name] = handler; } };
    const notice = { textContent: '' }, discard = { hidden: true, addEventListener: () => { } };
    const document = { addEventListener: (name: string, handler: Function) => { listeners[name] = handler; }, querySelectorAll: (selector: string) => selector === 'form' ? [form] : [{ addEventListener: (name: string, handler: Function) => { linkListeners[name] = handler; } }], querySelector: (selector: string) => selector === '[data-page-status]' ? notice : discard };
    runInNewContext(script, { document, window: { addEventListener: (name: string, handler: Function) => { windowListeners[name] = handler; } }, location: { reload: () => assert.fail('Must not reload edited form') } });
    listeners.input();
    let prevented = false;
    linkListeners.click({ preventDefault: () => { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(discard.hidden, false);
    assert.match(notice.textContent, /unsaved changes/);
    formListeners.submit({ submitter: button, preventDefault: () => assert.fail('Initial submission should proceed') });
    assert.equal(button.value, 'approve');
    assert.equal(button.disabled, false);
    assert.equal(button.textContent, 'Submitting…');
    assert.equal(attributes['aria-busy'], 'true');
    prevented = false;
    formListeners.submit({ submitter: button, preventDefault: () => { prevented = true; } });
    assert.equal(prevented, true);
    windowListeners.pageshow();
    assert.equal(button.textContent, 'Approve draft');
    assert.equal(form.dataset.submitting, undefined);
    assert.equal(attributes['aria-busy'], undefined);
});
test('notification exposes explicit revoke; stale or answered approvals have no action', () => {
    const pr = sample();
    assert.match(renderPr(pr, [], { config, messages: [message('notification')] }), /value="revoke"/);
    const delivered = renderPr({ ...pr, state: 'delivered' }, [], { config, messages: [message()] });
    assert.doesNotMatch(delivered, /value="approve"|Review before sharing|before approving/);
    assert.match(delivered, /Flags raised during drafting/);
    assert.match(delivered, /The decision and approved text are shown below/);
    assert.doesNotMatch(renderPr(pr, [], { config, messages: [{ ...message(), sentEmailId: 'old' }] }), /value="approve"/);
});
test('all untrusted fields and form values are escaped; locked design has no decorative elements', () => {
    const evil = '</textarea><script>alert("x")</script><img src=x onerror=alert(1)>';
    const pr = { ...sample(), question: evil, draft_answer: evil, approved_text: evil, draft_flagged: JSON.stringify([evil]), matched_source_ids: JSON.stringify([evil]) };
    const inbox = renderInbox([pr], { csrfToken: '" onfocus="alert(1)', config: { ...config, RESPONDER_IDENTITY: evil } });
    const detail = renderPr(pr, [{ id: 1, pr_id: pr.id, at: pr.created_at, kind: evil, detail: evil }], { csrfToken: '" onfocus="alert(1)', config, messages: [{ ...message(), bodyText: evil }] });
    for (const html of [inbox, detail]) {
        assert.ok(html.includes('&lt;'));
        assert.doesNotMatch(html, /<img|<svg|box-shadow|linear-gradient|<script>alert|value="" onfocus=/i);
        assert.match(html, /background:\s*#fff/);
    }
    assert.doesNotMatch(detail, /<\/textarea><script>/);
});
