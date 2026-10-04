import test from 'node:test';
import assert from 'node:assert/strict';
import { nextWarningState, isDuplicateViolation } from '../src/lib/examSecurity.js';

test('the third security violation locks an attempt without requesting submission', () => {
  assert.deepEqual(nextWarningState(1), { warningCount: 2, locked: false });
  assert.deepEqual(nextWarningState(2), { warningCount: 3, locked: true });
});

test('repeated blur and visibility events from one transition are counted once', () => {
  assert.equal(isDuplicateViolation(1000, 1700), true);
  assert.equal(isDuplicateViolation(1000, 2600), false);
});
