# Independent arena acceptance task

Build a small dependency-free JavaScript module and meaningful tests in your
assigned working directory. Use only synthetic data. Do not read or write any
recruitment business data, global configuration or files outside your cwd.

Export `selectCandidates(rows, overrides = {})` from selection.mjs.
Each row has id, score, active and historyIncluded.
Rows with score null, score below 80 or active false are never selected.
Otherwise default inclusion is the inverse of historyIncluded.
An own boolean override for a row ID replaces default inclusion.
A true override cannot bypass the hard gates.
Return selected IDs sorted alphabetically without mutating input.

Create selection.test.mjs using node:assert/strict and run it with Node.
Verify history exclusion, manual reinclusion, manual exclusion, threshold 80,
unknown scores, inactive rows and unchanged input.
Give a short rationale describing alternatives considered and rejected.

Your final JSON must follow the runner's receipt schema and list your real
nonempty artifact files, including the module and tests.
