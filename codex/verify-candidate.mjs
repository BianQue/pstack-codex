import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const { selectCandidates } = await import(pathToFileURL(path.resolve(process.argv[2])));
const rows = [
  { id: "threshold", score: 80, active: true, historyIncluded: false },
  { id: "unknown", score: null, active: true, historyIncluded: false },
  { id: "below", score: 79.99, active: true, historyIncluded: false },
  { id: "historical", score: 100, active: true, historyIncluded: true },
  { id: "inactive", score: 100, active: false, historyIncluded: false },
];
const before = structuredClone(rows);
assert.deepEqual(selectCandidates(rows), ["threshold"]);
assert.deepEqual(selectCandidates(rows, {
  unknown: true, below: true, historical: true, inactive: true, threshold: false,
}), ["historical"]);
assert.deepEqual(rows, before);
assert.deepEqual(selectCandidates([], { nonexistent: true }), []);
console.log("Independent candidate behavior checks: PASS");
