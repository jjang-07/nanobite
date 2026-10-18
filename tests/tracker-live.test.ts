import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDb, migrate, insertPr, updatePr, getPr, addEvent, listEvents } from '../src/db/db.ts';
import { trackSteps, renderPr, renderInbox } from '../src/dashboard/render.ts';
import { startDashboard } from '../src/dashboard/server.ts';
import { loadConfig } from '../src/config.ts';
const config = loadConfig({ APPROVER_NAME: 'TK' });
function pr(state: string, patch: Record<string, unknown> = {}, kinds: string[] = []) {
    const db = openDb(':memory:'); migrate(db);
    insertPr(db, { id: 'cpr_t1', state, requester_identity: 'yunha-agent@x.primitive.email', responder_identity: 'sdk-help@x.primitive.email', topic: 'acme-sdk/retries', question: 'Why do concurrent retries create duplicate charges?', on_behalf_of: 'Yunha (startup)' });
    if (Object.keys(patch).length) updatePr(db, 'cpr_t1', patch as any);
    for (const k of kinds) addEvent(db, 'cpr_t1', k);
    return { db, row: getPr(db, 'cpr_t1')!, events: listEvents(db, 'cpr_t1') };
}
const statuses = (p: ReturnType<typeof pr>) => trackSteps(p.row, p.events, config).map(s => `${s.key}:${s.status}`).join(' ');
test('tracker shows each stage like a delivery timeline, with the three gates labeled', () => {
    const steps = trackSteps(pr('queued').row, [], config);
    assert.deepEqual(steps.map(s => s.key), ['asked', 'received', 'rules', 'minimize', 'human', 'delivered']);
    assert.deepEqual(steps.filter(s => s.gate).map(s => `${s.gate}:${s.title}`), ['1:Rules', '2:Minimize', '3:Human']);
    assert.equal(statuses(pr('queued')), 'asked:current received:waiting rules:waiting minimize:waiting human:waiting delivered:waiting');
    assert.equal(statuses(pr('drafting', {}, ['request_sent', 'received', 'sources_matched'])), 'asked:done received:done rules:done minimize:current human:waiting delivered:waiting');
    const waiting = pr('awaiting_approval', { draft_answer: 'Use one key.', removals: JSON.stringify([{ placeholder: '[another customer]', count: 3 }]) }, ['request_sent', 'received', 'sources_matched', 'rules_applied', 'drafted', 'approval_sent']);
    assert.equal(statuses(waiting), 'asked:done received:done rules:done minimize:done human:current delivered:waiting');
    const steps2 = trackSteps(waiting.row, waiting.events, config);
    assert.match(steps2.find(s => s.key === 'human')!.label, /Waiting for your approval/);
    assert.match(steps2.find(s => s.key === 'rules')!.detail, /\[another customer\] ×3/);
    const reported = pr('reported', { draft_answer: 'x', decision: 'approve', outcome_result: 'passed' }, ['request_sent', 'received', 'sources_matched', 'drafted', 'decision', 'delivered', 'outcome']);
    assert.equal(statuses(reported), 'asked:done received:done rules:done minimize:done human:done delivered:done');
});
test('tracker marks a stop clearly: human denial, no source, automatic approval', () => {
    const denied = pr('denied', { draft_answer: 'x', decision: 'deny', decision_reason: 'mentions an unreleased version' }, ['request_sent', 'received', 'sources_matched', 'drafted', 'decision']);
    assert.equal(statuses(denied), 'asked:done received:done rules:done minimize:done human:stopped delivered:current');
    assert.match(trackSteps(denied.row, denied.events, config).find(s => s.key === 'human')!.detail, /unreleased/);
    const none = pr('denied', { decision: 'deny', decision_reason: 'no_sources' }, ['request_sent', 'received']);
    assert.equal(statuses(none), 'asked:done received:done rules:stopped minimize:skipped human:skipped delivered:current');
    const auto = pr('delivered', { draft_answer: 'x', decision: 'auto' }, ['request_sent', 'received', 'sources_matched', 'drafted', 'auto_merged', 'delivered']);
    assert.match(trackSteps(auto.row, auto.events, config).find(s => s.key === 'human')!.detail, /rule/i);
});
test('detail page and Inbox carry the tracker and update in place, never by reloading', () => {
    const p = pr('awaiting_approval', { draft_answer: 'Use one key.' }, ['request_sent', 'received', 'drafted']);
    const html = renderPr(p.row, p.events, { config });
    assert.match(html, /class="track"/);
    assert.match(html, /Gate 1/); assert.match(html, /Gate 3/);
    // Four checkpoints keep the top timeline focused on approval and delivery.
    const track = html.slice(html.indexOf('class="track"'), html.indexOf('</ol>', html.indexOf('class="track"')));
    assert.deepEqual([...track.matchAll(/<li class="track-step[^"]*" data-anim-key="(step-\w+)"/g)].map(m => m[1]), ['step-asked', 'step-received', 'step-approval', 'step-delivered']);
    assert.match(track, /data-anim-key="step-approval" data-group="gate" data-status="current"/);
    assert.match(track, />Approval<.*>Waiting for your approval</);
    assert.doesNotMatch(html, /\bTK\b|Reviewing as/);
    assert.doesNotMatch(track, /Three gates|gate-sub|>Rules<|>Minimize<|>Human</);
    assert.doesNotMatch(html, /Outcome<\/span>|Waiting for Yunha's test result/);
    assert.doesNotMatch(track, /track-detail|Masked|Approval email sent/);
    // The details live in the Activity log at the bottom of the page instead.
    const log = html.slice(html.indexOf('Activity log'));
    assert.ok(html.indexOf('Activity log') > html.indexOf('Draft answer'));
    assert.match(log, /Waiting for your approval/);
    assert.doesNotMatch(html, /<h2[^>]*>Request context<\/h2>/);
    assert.doesNotMatch(html, /setInterval\(|http-equiv="refresh"/, "no timed page reload; only the explicit discard button reloads");
    const inbox = renderInbox([p.row], { config });
    assert.match(inbox, /data-live="\/live"/);
    assert.match(inbox, /class="mini-track"/);
    assert.match(inbox, /<span [^>]*data-group="gate" data-status=/, 'gate segments are marked in the Inbox bar');
    assert.doesNotMatch(inbox, /action="\/requests"/, 'requests come from agents, not from a dashboard form');
    assert.doesNotMatch(inbox, /setInterval\(|http-equiv="refresh"/);
});
test('completion wording matches across the timeline, header, and Inbox for every decision', () => {
    const cases = [
        { state: 'delivered', decision: 'approve', title: 'Delivered', label: 'Approved by you', status: 'done' },
        { state: 'reported', decision: 'edit', title: 'Delivered (edited)', label: 'Edited by you', status: 'done' },
        { state: 'approved', decision: 'edit', title: 'Delivery', label: 'Edited by you · Delivering', status: 'current' },
        { state: 'delivered', decision: 'approve_always', title: 'Delivered', label: 'Approved by you', status: 'done' },
        { state: 'delivered', decision: 'auto', title: 'Delivered', label: 'Auto-approved under a rule', status: 'done' },
        { state: 'denied', decision: 'deny', sent: 'denial_sent', title: 'Delivered (denied)', label: 'Denied by you', status: 'done' },
        { state: 'denied', decision: 'deny', title: 'Delivering (denied)', label: 'Denied by you', status: 'current' },
        { state: 'denied', decision: 'deny', reason: 'no_sources', sent: 'denial_sent', title: 'Delivered (denied)', label: 'No matching source', status: 'done' },
        { state: 'failed', title: 'Not shared', label: 'Request stopped', status: 'skipped' },
    ];
    for (const c of cases) {
        const p = pr(c.state, { decision: c.decision ?? null, decision_reason: c.reason ?? null, capsule_sent_email_id: c.sent ?? null });
        try {
            const html = renderPr(p.row, p.events, { config });
            const final = html.match(/<li class="track-step" data-anim-key="step-delivered"[^>]*>[\s\S]*?<\/li>/)![0];
            assert.ok(final.includes(`data-status="${c.status}"`));
            assert.ok(final.includes(`>${c.title}</span>`));
            assert.ok(final.includes(`>${c.label}</span>`));
            if (['delivered', 'reported', 'denied'].includes(c.state)) {
                assert.ok(html.includes(`>${c.title}</span>`));
                assert.ok(renderInbox([p.row], { config }).includes(`>${c.title}</span>`));
            }
            if (c.state === 'denied' || c.state === 'failed') assert.doesNotMatch(final, /Approved by|Edited by/);
            if (c.decision === 'auto') assert.doesNotMatch(final, /Approved by you/);
        }
        finally { p.db.close(); }
    }
});
test('live endpoints return fresh HTML only when the state changed', async () => {
    const db = openDb(':memory:'); migrate(db);
    insertPr(db, { id: 'cpr_live', state: 'requested', requester_identity: 'yunha-agent@x.primitive.email', responder_identity: 'sdk-help@x.primitive.email', topic: 'acme-sdk/retries', question: 'Why do concurrent retries create duplicate charges?' });
    const server = await startDashboard(db, 0, { config });
    const port = (server.address() as any).port, base = `http://127.0.0.1:${port}`;
    try {
        const first = await (await fetch(`${base}/pr/cpr_live/live`)).json();
        assert.ok(first.version); assert.match(first.html, /class="track"/);
        const same = await (await fetch(`${base}/pr/cpr_live/live?v=${encodeURIComponent(first.version)}`)).json();
        assert.equal(same.html, undefined);
        updatePr(db, 'cpr_live', { state: 'awaiting_approval', draft_answer: 'Use one key.' }); addEvent(db, 'cpr_live', 'approval_sent');
        const changed = await (await fetch(`${base}/pr/cpr_live/live?v=${encodeURIComponent(first.version)}`)).json();
        assert.notEqual(changed.version, first.version); assert.match(changed.html, /Waiting for your approval/);
        const inbox = await (await fetch(`${base}/live`)).json();
        assert.match(inbox.html, /cpr_live/);
        assert.equal((await fetch(`${base}/pr/cpr_nope/live`)).status, 404);
    }
    finally { server.close(); await once(server, 'close'); db.close(); }
});
import { runInNewContext } from 'node:vm';
test('the page script swaps in fresh HTML when the version changes, and never while you are editing', async () => {
    const p = pr('awaiting_approval', { draft_answer: 'Use one key.' }, ['request_sent']);
    const script = renderPr(p.row, p.events, { config }).match(/<script>([\s\S]*?)<\/script>/)![1];
    const root = { dataset: { live: '/pr/cpr_t1/live', version: 'v1' } as Record<string, string>, innerHTML: 'OLD', contains: () => false };
    const stamp = { textContent: 'Live' }, stub = { textContent: '', hidden: true, addEventListener: () => { } };
    const listeners: Record<string, Function> = {};
    let timer: Function | null = null, response = { version: 'v2', html: 'NEW' }, fetched: string[] = [];
    const document = { hidden: false, activeElement: null, addEventListener: (n: string, h: Function) => { listeners[n] = h; }, querySelectorAll: () => [], querySelector: (s: string) => s === '[data-live]' ? root : s === '[data-live-stamp]' ? stamp : stub };
    const fetch = async (url: string) => { fetched.push(url); return { ok: true, json: async () => response }; };
    runInNewContext(script, { document, window: { addEventListener: () => { } }, location: { reload: () => assert.fail('must not reload') }, fetch, setTimeout: (f: Function) => { timer = f; }, encodeURIComponent, Date });
    const tick = async () => { const f = timer!; timer = null; await f(); };
    await tick();
    assert.equal(fetched[0], '/pr/cpr_t1/live?v=v1');
    assert.equal(root.innerHTML, 'NEW'); assert.equal(root.dataset.version, 'v2');
    assert.match(stamp.textContent, /^Live · updated /);
    listeners.input();
    response = { version: 'v3', html: 'NEWER' };
    await tick();
    assert.equal(root.innerHTML, 'NEW', 'no swap while the reviewer has unsaved edits');
    assert.equal(root.dataset.version, 'v2');
});
test('a step that just completed is marked for the completion animation; nothing animates on first load', async () => {
    const p = pr('awaiting_approval', { draft_answer: 'Use one key.' }, ['request_sent']);
    const html = renderPr(p.row, p.events, { config });
    assert.match(html, /<li class="track-step" data-anim-key="step-approval"/);
    assert.match(renderInbox([p.row], { config }), /data-anim-key="cpr_t1:4"/);
    const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
    const el = (key: string, status: string) => { const classes: string[] = []; return { dataset: { animKey: key, status }, classList: { add: (c: string) => classes.push(c) }, classes }; };
    let current = [el('step-received', 'done'), el('step-approval', 'current')];
    const root = { dataset: { live: '/pr/cpr_t1/live', version: 'v1' } as Record<string, string>, contains: () => false, querySelectorAll: () => current,
        set innerHTML(_v: string) { current = [el('step-received', 'done'), el('step-approval', 'done')]; }, get innerHTML() { return ''; } };
    const stub = { textContent: '', hidden: true, addEventListener: () => { } };
    let timer: Function | null = null;
    const document = { hidden: false, activeElement: null, addEventListener: () => { }, querySelectorAll: () => [], querySelector: (s: string) => s === '[data-live]' ? root : stub };
    runInNewContext(script, { document, window: { addEventListener: () => { } }, location: { reload: () => assert.fail() }, fetch: async () => ({ ok: true, json: async () => ({ version: 'v2', html: 'x' }) }), setTimeout: (f: Function) => { timer = f; }, encodeURIComponent, Date });
    await timer!();
    assert.deepEqual(current[1].classes, ['just-done'], 'Approval just completed');
    assert.deepEqual(current[0].classes, [], 'Received was already done');
});
test('group labels above the tracker have no underline', () => {
    const p = pr('queued');
    assert.doesNotMatch(renderPr(p.row, p.events, { config }), /\.track-group\{[^}]*border-bottom/);
});
