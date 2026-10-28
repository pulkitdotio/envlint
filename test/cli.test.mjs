import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const bin = fileURLToPath(new URL("../dist/bin.js", import.meta.url));
const root = fileURLToPath(new URL("../", import.meta.url));

function project(t, files = { ".env": "KEY=fictional", ".env.example": "KEY=" }) {
  const cwd = mkdtempSync(join(tmpdir(), "envlint-test-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  for (const [name, source] of Object.entries(files)) writeFileSync(join(cwd, name), source);
  return cwd;
}

function run(cwd, args = []) {
  const env = { ...process.env, NO_COLOR: "1", NODE_OPTIONS: "" };
  delete env.FORCE_COLOR;
  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd, encoding: "utf8", timeout: 10000,
    env,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return { code: result.status, out: result.stdout, err: result.stderr };
}

function json(cwd, args = []) {
  const result = run(cwd, [...args, "--json"]);
  assert.equal(result.err, "");
  assert.doesNotMatch(result.out, /\u001b/);
  return { ...result, report: JSON.parse(result.out) };
}

test("defaults pass with or without JSON; no config file is necessary", (t) => {
  const cwd = project(t);
  const result = run(cwd);
  assert.equal(result.code, 0);
  assert.equal(result.err, "");
  assert.match(result.out, /validation passed\n0 errors, 0 warnings/);
  const structured = json(cwd);
  assert.equal(structured.code, 0);
  assert.deepEqual(structured.report, { status: "passed", errors: 0, warnings: 0, issues: [] });
});

test("missing and empty variables fail with exit code 1 and locations", (t) => {
  const cwd = project(t, { ".env": "EMPTY=", ".env.example": "MISSING=\nEMPTY=" });
  const result = json(cwd);
  assert.equal(result.code, 1);
  assert.equal(result.report.status, "failed");
  assert.deepEqual(result.report.issues.map((issue) => issue.code), ["missing", "empty"]);
  assert.equal(result.report.issues[1].line, 1);
});

test("warnings pass and strict unexpected keys fail", (t) => {
  const cwd = project(t, { ".env": "KEY=fictional\nEXTRA=fictional", ".env.example": "KEY=" });
  const normal = json(cwd);
  assert.equal(normal.code, 0);
  assert.equal(normal.report.warnings, 1);
  const strict = json(cwd, ["--strict"]);
  assert.equal(strict.code, 1);
  assert.equal(strict.report.errors, 1);
  assert.equal(strict.report.warnings, 0);
});

test("supports custom paths, equals flags, and explicit configuration", (t) => {
  const cwd = project(t, {
    "custom environment": "PORT=3000\nFLAG=false",
    "expected.example": "PORT=not-a-number\nFLAG=placeholder\nOPTIONAL=",
    "rules.json": JSON.stringify({ variables: { PORT: { type: "number" }, FLAG: { type: "boolean" }, OPTIONAL: { required: false } } }),
    ".envlint.json": "invalid default is ignored when explicit config is supplied",
  });
  const result = json(cwd, ["--env", "custom environment", "--example=expected.example", "--config", "rules.json"]);
  assert.equal(result.code, 0);
});

test("loads default rules and rejects invalid types", (t) => {
  const cwd = project(t, {
    ".env": "PORT=synthetic-secret-number\nFLAG=synthetic-secret-bool\nURL=synthetic-secret-url",
    ".env.example": "PORT=\nFLAG=\nURL=\nOPTIONAL=",
    ".envlint.json": JSON.stringify({ variables: { PORT: { type: "number" }, FLAG: { type: "boolean" }, URL: { type: "url" }, OPTIONAL: { required: false } } }),
  });
  const result = json(cwd);
  assert.equal(result.code, 1);
  assert.equal(result.report.errors, 3);
  assert.ok(result.report.issues.every((issue) => issue.code === "invalid_type"));
  assert.doesNotMatch(result.out, /synthetic-secret/);
});

test("missing environment, example, and explicitly requested config files exit 2", (t) => {
  for (const files of [{}, { ".env": "KEY=fictional" }, { ".env.example": "KEY=" }]) {
    const result = json(project(t, files));
    assert.equal(result.code, 2);
    assert.equal(result.report.status, "error");
    assert.ok(result.report.issues.every((issue) => issue.code === "file_error"));
  }
  const result = json(project(t), ["--config", "absent.json"]);
  assert.equal(result.code, 2);
  assert.equal(result.report.issues[0].code, "file_error");
});

test("a directory in place of a config file is an error, not an absent optional config", (t) => {
  const cwd = project(t);
  mkdirSync(join(cwd, ".envlint.json"));
  assert.equal(json(cwd).code, 2);
});

test("invalid JSON and invalid config structures exit 2 without value disclosure", (t) => {
  for (const source of ['{"variables":synthetic-secret}', '{"variables":{"KEY":{"type":"synthetic-secret"}}}', "[]"]) {
    const cwd = project(t, { ".env": "KEY=synthetic-secret", ".env.example": "KEY=", ".envlint.json": source });
    for (const args of [[], ["--json"]]) {
      const result = run(cwd, args);
      assert.equal(result.code, 2);
      assert.doesNotMatch(result.out + result.err, /synthetic-secret/);
      if (args.length) assert.equal(JSON.parse(result.out).issues[0].code, "invalid_config");
      else assert.match(result.err, /invalid_config/);
    }
  }
});

test("malformed and duplicate declarations in either file exit 1", (t) => {
  const cwd = project(t, { ".env": "KEY=fictional\nKEY=other\nbroken", ".env.example": "KEY=\nKEY=\nbroken" });
  const result = json(cwd);
  assert.equal(result.code, 1);
  assert.equal(result.report.errors, 4);
  assert.equal(result.report.issues[0].line, 2);
  assert.equal(result.report.issues[1].line, 3);
});

test("invalid CLI usage exits 2 and JSON remains valid even on parse errors", (t) => {
  const cwd = project(t);
  for (const args of [["--unknown=synthetic-secret"], ["positional-synthetic-secret"], ["--env"], ["--env", ""],
    ["--env", "--strict"], ["--strict", "--strict"], ["--env=a", "--env=b"], ["--strict=false"]]) {
    const human = run(cwd, args);
    assert.equal(human.code, 2, JSON.stringify(args));
    assert.equal(human.out, "");
    assert.doesNotMatch(human.err, /synthetic-secret/);
    const structured = json(cwd, args);
    assert.equal(structured.code, 2);
    assert.equal(structured.report.issues[0].code, "usage");
  }
  const invalidJsonFlag = run(cwd, ["--json=false"]);
  assert.equal(invalidJsonFlag.code, 2);
  assert.equal(JSON.parse(invalidJsonFlag.out).issues[0].code, "usage");
});

test("help and version work without files and support JSON and short aliases", (t) => {
  const cwd = project(t, {});
  const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
  for (const flag of ["--help", "-h"]) {
    const result = run(cwd, [flag]);
    assert.equal(result.code, 0);
    assert.match(result.out, /Usage: envlint/);
    assert.equal(result.err, "");
  }
  for (const flag of ["--version", "-v"]) assert.equal(run(cwd, [flag]).out, `${version}\n`);
  assert.equal(json(cwd, ["--version"]).report.version, version);
  assert.match(json(cwd, ["--help"]).report.help, /Usage: envlint/);
});

test("no reports echo secrets from values, duplicates, malformed lines, or placeholders", (t) => {
  const cwd = project(t, {
    ".env": "TOKEN=synthetic-secret-a\nTOKEN=synthetic-secret-b\nEXTRA=synthetic-secret-c\nPORT=synthetic-secret-d\nsynthetic-secret-e",
    ".env.example": "TOKEN=synthetic-secret-placeholder\nPORT=",
    ".envlint.json": '{"variables":{"PORT":{"type":"number"}}}',
  });
  for (const args of [[], ["--json"], ["--strict", "--json"]]) {
    const result = run(cwd, args);
    assert.equal(result.code, 1);
    assert.doesNotMatch(result.out + result.err, /synthetic-secret|\u001b/);
    assert.match(result.out, /TOKEN/);
  }
});

test("package exposes a shebang executable and contains no runtime dependencies", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(pkg.bin.envlint, "dist/bin.js");
  assert.equal(pkg.dependencies, undefined);
  assert.match(readFileSync(bin, "utf8"), /^#!\/usr\/bin\/env node\n/);
});
