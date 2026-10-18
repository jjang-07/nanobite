import { test } from 'node:test';
import assert from 'node:assert/strict';
import { approverReachable } from '../scripts/preflight.ts';
const base = { responder: 'sdk-help@fair-fly.primitive.email', accountEmail: 'owner@university.example', inboundSenders: [] as string[] };
test('approver reachability follows a new Primitive account send rules', () => {
    assert.equal(approverReachable({ ...base, approver: 'tk@fair-fly.primitive.email' }).ok, true, 'Primitive address');
    assert.equal(approverReachable({ ...base, approver: 'Owner@University.Example' }).ok, true, 'account owner');
    assert.equal(approverReachable({ ...base, approver: 'tk@university.example', inboundSenders: ['TK <tk@university.example>'] }).ok, true, 'has written first');
    const blocked = approverReachable({ ...base, approver: 'tk@university.example' });
    assert.equal(blocked.ok, false);
    assert.match(blocked.fix!, /tk@university\.example.*email.*sdk-help@fair-fly\.primitive\.email/);
});
