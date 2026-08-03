const test = require("node:test");
const assert = require("node:assert");
const { sum } = require("./sum");

test("sum adds two positive numbers", () => {
  assert.strictEqual(sum(2, 3), 5);
});

test("sum adds negative numbers", () => {
  assert.strictEqual(sum(-1, -1), -2);
});

test("sum with zero returns the other number", () => {
  assert.strictEqual(sum(0, 7), 7);
});
