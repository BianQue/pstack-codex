import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { checkPackage, fingerprint, pluginDir, root } from "./check-codex.mjs";

assert(process.env.TLA2TOOLS, "Set TLA2TOOLS to the pinned tla2tools.jar before running the full suite");
const target = process.argv[2] ?? pluginDir;
assert(path.isAbsolute(target), "Installed package path must be absolute");
checkPackage(target);
assert.equal(fingerprint(target), fingerprint(), "Installed package differs from generated package");
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", windowsHide: true,
    env: { ...process.env, PSTACK_CODEX_TEST_PLUGIN_DIR: target } });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command} ${args.join(" ")} failed`);
};
run(process.execPath, ["scripts/generate-pstack-harness-trees.mjs", "--check"]);
run(process.execPath, ["scripts/check-codex.mjs"]);
const statechart = path.join(target, "skills/statechart/scripts/test");
// The upstream CLI suite invokes POSIX shebang fixtures and tests Unix signals.
// Native Windows entry and real TLC are covered separately below.
const windowsExcluded = new Set(["cli.test.ts", "corpus.test.ts"]);
const statechartTests = readdirSync(statechart).filter(file => file.endsWith(".test.ts") &&
  (process.platform !== "win32" || !windowsExcluded.has(file))).map(file => path.join(statechart, file));
run(process.execPath, ["--disable-warning=ExperimentalWarning", "--test",
  "scripts/check-codex.test.mjs", "scripts/statechart-native.test.mjs",
  path.join(target, "skills/arena/scripts/codex-arena.test.mjs"), ...statechartTests]);
run(process.env.BUN ?? "bun", ["test",
  ...(process.platform === "win32"
    ? ["--test-name-pattern", "^(?!.*requests and parses fork identity)"] : []),
  path.join(target, "skills/poteto-mode/scripts/watch-pr"),
  path.join(target, "skills/poteto-mode/scripts/check-plan.test.ts")]);
