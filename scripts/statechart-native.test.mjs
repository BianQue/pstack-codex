import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { pluginDir, sha256 } from "./check-codex.mjs";

const scripts = path.join(process.env.PSTACK_CODEX_TEST_PLUGIN_DIR ?? pluginDir, "skills/statechart/scripts");
const skip = !process.env.TLA2TOOLS && "Full suite requires the pinned TLC jar";
for (const [name, status] of [["Login", 0], ["CounterRules", 1]]) {
  test(`native ${process.platform} entry produces the recorded ${name} verdict with real TLC`, { skip }, () => {
    assert.equal(sha256(fs.readFileSync(process.env.TLA2TOOLS)),
      "936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88");
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "pstack-native-"));
    try {
      const corpus = path.join(scripts, "test/corpus", name);
      const output = path.join(temp, "out");
      const args = [path.join(scripts, "statechart.ts"), path.join(corpus, `${name}.tla`)];
      if (fs.existsSync(path.join(corpus, "view.mjs"))) args.push("--view", path.join(corpus, "view.mjs"));
      args.push("--out", output);
      const run = () => spawnSync(process.execPath, args, {
        encoding: "utf8", timeout: 120000, windowsHide: true,
        env: { ...process.env, NODE_NO_WARNINGS: "1", TMPDIR: temp, TEMP: temp, TMP: temp },
      });
      const result = run();
      assert.equal(result.error, undefined);
      assert.equal(result.stderr, "");
      assert.equal(result.status, status, result.stdout);
      for (const file of ["report.md", "chart.mmd"]) {
        assert.equal(fs.readFileSync(path.join(output, file), "utf8"),
          fs.readFileSync(path.join(corpus, file), "utf8"));
      }
      assert.deepEqual(fs.readdirSync(temp), ["out"], "Worker scratch leaked after normal exit");
      const before = fs.readFileSync(path.join(output, "report.md"));
      const collision = run();
      assert.equal(collision.status, 2);
      assert.match(collision.stderr, /not empty/);
      assert(fs.readFileSync(path.join(output, "report.md")).equals(before));
    } finally {
      fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5 });
    }
  });
}
