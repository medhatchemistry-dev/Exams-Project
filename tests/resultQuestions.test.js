import test from 'node:test';
import assert from 'node:assert/strict';
import { getResultQuestions, parseQuestionSnapshot } from '../src/lib/resultQuestions.js';

test('uses immutable question snapshots before trying legacy reconstruction', () => {
  const snapshot = [{ id: 'stored', options: [{ ar: 'A' }], answer: 0 }];
  let legacyCalled = false;
  const result = getResultQuestions({ questions_json: JSON.stringify(snapshot) }, () => { legacyCalled = true; return []; });
  assert.deepEqual(result, snapshot);
  assert.equal(legacyCalled, false);
});

test('reconstructs legacy results with no usable snapshot', () => {
  const legacy = [{ id: 'legacy' }];
  assert.deepEqual(getResultQuestions({ questions_json: null }, () => legacy), legacy);
  assert.deepEqual(getResultQuestions({ questions_json: '{invalid' }, () => legacy), legacy);
});

test('rejects snapshots that are not arrays', () => {
  assert.equal(parseQuestionSnapshot('{"id":1}'), null);
});
