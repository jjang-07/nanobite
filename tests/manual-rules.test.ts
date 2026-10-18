import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, migrate, getPr } from '../src/db/db.ts';
import { saveProtectionRule, listProtectionRules, setProtectionRuleEnabled } from '../src/gates/protection-store.ts';
import { loadRules, applyRules, seedRules } from '../src/gates/rules.ts';
import { createManualApprovalRule, listApprovalRules, findRule, revokeScopedRule } from '../src/approval/rules-store.ts';
import { setup, queued, incoming } from './helpers.ts';
import { pollInbound, processReceived } from '../src/pipeline/responder.ts';
const owner = 'sdk-help@acme.local', other = 'sdk-help@other.local';
const input = { kind: 'literal', pattern: 'Example Client', placeholder: '[customer]', note: 'Customer privacy' };
const sqlPath = new URL('../demo/fixtures/rules.sql', import.meta.url).pathname;

test('manual protections can be edited, disabled and re-enabled only for their responder', () => {
    const db = openDb(':memory:'); migrate(db);
    try {
        const id = saveProtectionRule(db, owner, input);
        assert.equal(applyRules('Example Client had a timeout.', loadRules(db, owner)).text, '[customer] had a timeout.');
        assert.equal(loadRules(db, other).length, 0);
        assert.throws(() => saveProtectionRule(db, other, input, id), /not found/);
        assert.throws(() => setProtectionRuleEnabled(db, other, id, false), /not found/);
        setProtectionRuleEnabled(db, owner, id, false);
        assert.equal(loadRules(db, owner).length, 0);
        saveProtectionRule(db, owner, { ...input, kind: 'sentence', pattern: 'unreleased', placeholder: '[internal]' }, id);
        setProtectionRuleEnabled(db, owner, id, true);
        assert.equal(applyRules('Use one key. The unreleased version changes it. Done.', loadRules(db, owner)).text, 'Use one key. [sentence removed: [internal]] Done.');
        for (const invalid of [{ ...input, pattern: ' ' }, { ...input, kind: 'regex' }, { ...input, placeholder: 'customer' }])
            assert.throws(() => saveProtectionRule(db, owner, invalid));
    } finally { db.close(); }
});

test('reseed preserves custom protections and disabled built-ins without duplicates', () => {
    const db = openDb(':memory:'); migrate(db);
    try {
        seedRules(db, sqlPath, owner);
        const seeded = listProtectionRules(db, owner)[0];
        setProtectionRuleEnabled(db, owner, seeded.id, false);
        const id = saveProtectionRule(db, owner, input);
        assert.throws(() => saveProtectionRule(db, owner, { ...input, pattern: 'example client' }), /already exists/);
        seedRules(db, sqlPath, owner);
        seedRules(db, sqlPath, owner);
        const rows = listProtectionRules(db, owner);
        assert.equal(rows.filter(r => r.is_custom).length, 1);
        assert.equal(rows.find(r => r.id === id)?.pattern, input.pattern);
        assert.equal(rows.filter(r => !r.is_custom).length, 11);
        assert.equal(rows.find(r => !r.is_custom && r.kind === seeded.kind && r.pattern === seeded.pattern)?.enabled, 0);
        assert.throws(() => saveProtectionRule(db, owner, input, rows.find(r => !r.is_custom)!.id), /not found/);
    } finally { db.close(); }
});

test('old databases gain enabled and custom-rule metadata without losing protections', () => {
    const db = openDb(':memory:');
    db.exec("CREATE TABLE denylist(id INTEGER PRIMARY KEY,responder_identity TEXT NOT NULL,kind TEXT NOT NULL,pattern TEXT NOT NULL,placeholder TEXT NOT NULL,note TEXT); INSERT INTO denylist(responder_identity,kind,pattern,placeholder) VALUES('sdk-help@acme.local','literal','Example Client','[customer]')");
    try {
        migrate(db); migrate(db);
        assert.equal(loadRules(db, owner).length, 1);
        assert.equal(listProtectionRules(db, owner)[0].enabled, 1);
        assert.equal(listProtectionRules(db, owner)[0].is_custom, 0);
    } finally { db.close(); }
});

test('manual automatic approval requires exact scope and explicit confirmation', () => {
    const db = openDb(':memory:'); migrate(db);
    try {
        assert.throws(() => createManualApprovalRule(db, owner, 'requester@example.com', 'acme-sdk/retries', 'reviewer@example.com', false), /Confirm/);
        assert.throws(() => createManualApprovalRule(db, owner, 'requester@example.com', '*', 'reviewer@example.com', true), /exact topic/);
        const rule = createManualApprovalRule(db, owner, 'requester@example.com', 'acme-sdk/retries', 'reviewer@example.com', true);
        assert.equal(rule.created_from_pr, 'manual');
        assert.equal(listApprovalRules(db, owner).length, 1);
        assert.equal(listApprovalRules(db, other).length, 0);
        assert.equal(findRule(db, owner, 'other@example.com', rule.topic), null);
        assert.equal(findRule(db, owner, rule.requester_identity, 'another/topic'), null);
        assert.throws(() => revokeScopedRule(db, other, rule.id), /not found/);
        revokeScopedRule(db, owner, rule.id);
        assert.equal(findRule(db, owner, rule.requester_identity, rule.topic), null);
    } finally { db.close(); }
});

test('manual rules redact model inputs and outputs; scoped approval still drafts and notifies', async () => {
    const s = setup(), c = s.deps.config;
    try {
        saveProtectionRule(s.db, c.RESPONDER_IDENTITY, { kind: 'literal', pattern: 'v2.5', placeholder: '[internal version]' });
        const rule = createManualApprovalRule(s.db, c.RESPONDER_IDENTITY, c.REQUESTER_IDENTITY, 'acme-sdk/retries', c.APPROVER_EMAIL, true);
        let calls = 0;
        const draft = s.deps.drafter.draft.bind(s.deps.drafter);
        s.deps.drafter.draft = async input => { calls++; assert.ok(input.excerpts.every(e => !e.text.includes('v2.5'))); return draft(input); };
        const id = queued(s.db); s.mail.deliverInbound(incoming(id));
        await pollInbound(s.db, s.deps); await processReceived(s.db, s.deps);
        assert.equal(calls, 1);
        assert.equal(getPr(s.db, id)?.decision, 'auto');
        assert.ok(!getPr(s.db, id)?.approved_text?.includes('v2.5'));
        assert.equal(s.db.prepare("SELECT count(*) n FROM sent_emails WHERE pr_id=? AND purpose='notification'").get(id)?.n, 1);
        revokeScopedRule(s.db, c.RESPONDER_IDENTITY, rule.id);
        const next = queued(s.db, 'cpr_afterrevoke'); s.mail.deliverInbound(incoming(next));
        await pollInbound(s.db, s.deps); await processReceived(s.db, s.deps);
        assert.equal(getPr(s.db, next)?.state, 'awaiting_approval');
    } finally { s.db.close(); }
});
