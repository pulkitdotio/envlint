import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEnvironment } from "../dist/parser.js";
import { validateEnvironment } from "../dist/validate.js";
import { createReport, formatHuman, formatJson } from "../dist/report.js";

function validate(env, example, rules = {}, strict = false) {
  return validateEnvironment(parseEnvironment(env, ".env"), parseEnvironment(example, ".env.example"), new Map(Object.entries(rules)), strict);
}

test("uses example keys without validating or comparing placeholder values", () => {
  const issues = validate("PORT=3000\nFLAG=true", "PORT=not-a-number\nFLAG=", { PORT: { type: "number" }, FLAG: { type: "boolean" } });
  assert.deepEqual(issues, []);
});

test("missing required variables fail; explicitly optional variables may be absent", () => {
  const issues = validate("", "REQUIRED=\nOPTIONAL=", { OPTIONAL: { required: false } });
  assert.deepEqual(issues.map(({ code, key }) => [code, key]), [["missing", "REQUIRED"]]);
  assert.equal(issues[0].file, ".env");
});

test("config-only variables are recognized and required by default", () => {
  assert.equal(validate("", "", { ADDED: {} })[0].code, "missing");
  assert.deepEqual(validate("ADDED=ok", "", { ADDED: {} }, true), []);
  assert.deepEqual(validate("", "", { ADDED: { required: false } }), []);
});

test("empty and whitespace-only values obey allowEmpty independently of required", () => {
  const issues = validate('ONE=\nTWO="  "\nTHREE=\nFOUR=', "ONE=\nTWO=\nTHREE=\nFOUR=", {
    TWO: { required: false }, THREE: { allowEmpty: true, type: "number" },
    FOUR: { required: false, allowEmpty: true },
  });
  assert.deepEqual(issues.map(({ code, key }) => [code, key]), [["empty", "ONE"], ["empty", "TWO"]]);
  assert.equal(validate("", "ONE=", { ONE: { allowEmpty: true } })[0].code, "missing");
});

test("unexpected keys warn normally and fail in strict mode", () => {
  assert.equal(validate("EXTRA=fictional", "")[0].severity, "warning");
  assert.equal(validate("EXTRA=fictional", "", {}, true)[0].severity, "error");
  assert.equal(createReport(validate("EXTRA=fictional", "")).status, "passed");
});

test("reports duplicates and malformed lines in both files", () => {
  const issues = validate("KEY=a\nKEY=b\nbroken", "KEY=\nKEY=\nwrong");
  assert.deepEqual(issues.map((issue) => issue.code), ["duplicate", "malformed", "duplicate", "malformed"]);
  assert.equal(issues[2].file, ".env.example");
});

test("validates strict finite decimal numbers, exact booleans, and HTTP(S) URLs", () => {
  const cases = {
    number: {
      valid: ["0", "-1", "+2", "0.25", ".5", "1.", "1e3", "-2E-3"],
      invalid: ["NaN", "Infinity", "0xff", "1_000", "1,000", "42px", "1e999", " 12 ", "true"],
    },
    boolean: { valid: ["true", "false"], invalid: ["TRUE", "False", "1", "0", "yes", " true "] },
    url: {
      valid: ["https://example.com", "http://localhost:3000/path?a=b", "https://example.com/#fragment", "HTTPS://EXAMPLE.COM", "http://[::1]:8080"],
      invalid: ["ftp://example.com", "example.com", "https:example.com", "https://", "https://exa mple.com", "https://example.com/white space", "https://example.com:99999"],
    },
    string: { valid: ["fictional", "123", "anything # literal"], invalid: [] },
  };
  for (const [type, values] of Object.entries(cases)) {
    for (const value of values.valid) {
      assert.deepEqual(validate(`KEY='${value}'`, "KEY=placeholder", { KEY: { type } }), [], `${type}: ${value}`);
    }
    for (const value of values.invalid) {
      assert.equal(validate(`KEY='${value}'`, "KEY=placeholder", { KEY: { type } })[0].code, "invalid_type", `${type}: ${value}`);
    }
  }
});

test("human and JSON reports disclose no values, source excerpts, or ANSI by default", () => {
  const issues = validate('TOKEN=synthetic-secret-one\nTOKEN=synthetic-secret-two\nEXTRA=synthetic-secret-three\nPORT=synthetic-secret-four\nsynthetic-secret-five',
    "TOKEN=synthetic-secret-example\nPORT=", { PORT: { type: "number" } });
  const report = createReport(issues);
  for (const output of [formatHuman(report), formatJson(report)]) {
    assert.doesNotMatch(output, /synthetic-secret|\u001b/);
  }
  assert.equal(JSON.parse(formatJson(report)).errors, 3);
  assert.equal(report.warnings, 1);
  assert.match(formatHuman(report), /validation failed/);
  assert.match(formatHuman(report, true), /\u001b\[/);
});

test("escapes control characters in terminal file locations", () => {
  const report = createReport([{ code: "file_error", severity: "error", file: "bad\u001b[31m\nfile", message: "Cannot read file." }], true);
  assert.doesNotMatch(formatHuman(report), /\u001b/);
  assert.match(formatHuman(report), /bad\\u001b\[31m\\u000afile/);
  assert.equal(JSON.parse(formatJson(report)).issues[0].file, "bad\u001b[31m\nfile");
});
