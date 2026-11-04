import { createHash } from "node:crypto";
import { readFileSync, readdirSync, lstatSync, statSync } from "node:fs";
import { join, posix } from "node:path";

export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

export function skillMetadata(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error("Skill must start with YAML frontmatter");
  const head = match[1].replace(/\r\n/g, "\n");
  const name = head.match(/^name:\s*([a-z0-9-]+)\s*$/m)?.[1];
  const description = head.match(/^description:[^\n]*(?:\n[ \t]+[^\n]*)*/m)?.[0];
  if (!name || !description || description === "description:") {
    throw new Error("Skill must have a name and description");
  }
  const manual = /^disable-model-invocation:\s*true\s*$/m.test(head);
  return { name, description, manual, body: text.slice(match[0].length) };
}

export function adaptSkill(text, relativePath) {
  const { name, description, body } = skillMetadata(text);
  const adapter = posix.relative(posix.dirname(relativePath), "docs/harness/codex.md");
  return `---\nname: ${name}\n${description}\n---\n\n` +
    `In Codex, read [the Codex adapter](${adapter}) once per session before following this skill. ` +
    "Its tool, model, path and permission mappings take precedence over the upstream host examples below.\n\n" +
    body.trimStart();
}

export function markdownLinks(text) {
  const prose = text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, "");
  return [...prose.matchAll(/\]\(([^)\s]+)\)/g)].map(match => match[1]);
}

export function relativeLink(from, href) {
  const target = href.replace(/[#?].*/, "");
  if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || /[<>]/.test(target)) return;
  return posix.normalize(posix.join(posix.dirname(from), target));
}

export function sourceFiles(root, prefix = "") {
  return readdirSync(join(root, prefix)).sort().flatMap(name => {
    if (["node_modules", ".DS_Store", ".git"].includes(name)) return [];
    const relative = posix.join(prefix, name);
    if (lstatSync(join(root, relative)).isSymbolicLink()) throw new Error(`Unexpected symlink: ${relative}`);
    return statSync(join(root, relative)).isDirectory() ? sourceFiles(root, relative) : [relative];
  });
}

function entryBytes(bytes, relative) {
  if (relative.endsWith("SKILL.md")) return Buffer.from(adaptSkill(bytes.toString("utf8"), relative));
  if (/^agents\/.*\.md$/.test(relative) || relative.endsWith("FOR_AGENTS.md")) {
    const text = bytes.toString("utf8");
    const adapter = posix.relative(posix.dirname(relative), "docs/harness/codex.md");
    const pointer = `In Codex, read [the Codex adapter](${adapter}) before this brief; its host mappings take precedence.\n\n`;
    const front = text.match(/^---\n[\s\S]*?\n---\n/);
    return Buffer.from(front ? front[0] + "\n" + pointer + text.slice(front[0].length).trimStart() : pointer + text);
  }
  return bytes;
}

export function renderCodex(sourceRoot, overrideRoot) {
  const source = sourceFiles(sourceRoot);
  const overrides = new Set(sourceFiles(overrideRoot));
  const output = new Map();
  const coverage = [];
  for (const relative of source) {
    const bytes = readFileSync(join(sourceRoot, relative));
    let treatment = "copied";
    if (relative.startsWith(".cursor-plugin/") || relative === ".gitignore") {
      treatment = "host-metadata-excluded";
    } else {
      const chosen = overrides.has(relative) ? readFileSync(join(overrideRoot, relative)) : bytes;
      treatment = overrides.has(relative) ? "override" : "copied";
      output.set(relative, {
        bytes: entryBytes(chosen, relative),
        executable: (statSync(join(sourceRoot, relative)).mode & 0o111) !== 0,
      });
      if (relative.endsWith("SKILL.md") && treatment === "copied") treatment = "skill-adapted";
      if ((/^agents\/.*\.md$/.test(relative) || relative.endsWith("FOR_AGENTS.md")) && treatment === "copied") treatment = "brief-adapted";
    }
    coverage.push({ path: relative, sourceSha256: sha256(bytes), treatment });
  }
  for (const relative of overrides) {
    if (output.has(relative)) continue;
    const filename = join(overrideRoot, relative);
    const bytes = readFileSync(filename);
    output.set(relative, {
      bytes: entryBytes(bytes, relative),
      executable: (statSync(filename).mode & 0o111) !== 0,
    });
  }
  const skills = source.filter(relative => /^skills\/[^/]+\/SKILL\.md$/.test(relative)).map(relative => {
    const upstream = skillMetadata(readFileSync(join(sourceRoot, relative), "utf8"));
    const skill = relative.split("/")[1];
    output.set(`skills/${skill}/agents/openai.yaml`, {
      bytes: Buffer.from(`policy:\n  allow_implicit_invocation: ${!upstream.manual}\n`), executable: false,
    });
    return { name: skill, allowImplicitInvocation: !upstream.manual,
      adaptation: overrides.has(relative) ? "override" : "shared-adapter" };
  });
  const manifest = JSON.parse(output.get("plugin.json").bytes.toString("utf8"));
  const { $schema, ...compat } = manifest;
  output.set(".codex-plugin/plugin.json", {
    bytes: Buffer.from(JSON.stringify({ ...compat, skills: "./skills/" }, null, 2) + "\n"), executable: false,
  });
  const playbooks = source.filter(relative => relative.startsWith("skills/poteto-mode/playbooks/") && relative.endsWith(".md"));
  const dormantSkills = source.filter(relative => relative.startsWith("automations/") && relative.endsWith("SKILL.md"));
  const inventory = { upstreamSkills: skills, playbooks, dormantAutomationSkills: dormantSkills, sourceFiles: coverage };
  output.set("coverage.json", { bytes: Buffer.from(JSON.stringify(inventory, null, 2) + "\n"), executable: false });
  return output;
}
