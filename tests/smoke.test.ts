import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newPrId, nowIso } from '../src/ids.ts';
test('newPrId has the cpr_ prefix and is unique', () => {
    const a = newPrId();
    const b = newPrId();
    assert.match(a, /^cpr_[a-z0-9]{8,}$/);
    assert.notEqual(a, b);
});
test('nowIso is ISO 8601', () => { assert.match(nowIso(), /^\d{4}-\d{2}-\d{2}T/); });
