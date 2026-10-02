const assert = require('assert')
const { findClosest, levenshtein } = require('../src/fuzzy')
const { splitItems } = require('../src/commands')

assert.strictEqual(levenshtein('חלב', 'חלב'), 0)
assert.ok(levenshtein('חלל', 'חלב') <= 1)

const closest = findClosest('חלל', ['לחם', 'חלב', 'ביצים'])
assert.strictEqual(closest.item, 'חלב')

const far = findClosest('שוקולד מריר מאוד', ['חלב'])
assert.strictEqual(far, null)

assert.deepStrictEqual(splitItems('חלב, לחם\nביצים'), ['חלב', 'לחם', 'ביצים'])

console.log('smoke-test ok')
