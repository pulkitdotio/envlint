import assert from "node:assert/strict";
import { test } from "node:test";
import { parseConfiguration } from "../dist/config.js";

const parse = (data) => parseConfiguration(JSON.stringify(data), "rules.json");

test("accepts supported rules and empty variable maps", () => {
  const result = parse({ variables: {
    PORT: { required: true, type: "number", allowEmpty: false },
    LABEL: { required: false, type: "string", allowEmpty: true },
    FLAG: { type: "boolean" }, API: { type: "url" }, DEFAULTS: {},
  } });
  assert.deepEqual(result.issues, []);
  assert.equal(result.rules.get("LABEL").required, false);
  assert.equal(parse({ variables: {} }).issues.length, 0);
});

test("rejects invalid structures and unknown properties without echoing them", () => {
  const cases = [null, [], true, "synthetic-secret", {}, { variables: [] },
    { variables: {}, "synthetic-secret": "synthetic-secret" },
    { variables: { "bad-synthetic-secret-key": {} } },
    { variables: { KEY: null } }, { variables: { KEY: [] } },
    { variables: { KEY: { required: "synthetic-secret" } } },
    { variables: { KEY: { allowEmpty: 1 } } },
    { variables: { KEY: { type: "synthetic-secret" } } },
    { variables: { KEY: { type: ["number"] } } },
    { variables: { KEY: { type: { toString: "synthetic-secret" } } } },
    { variables: { KEY: { "synthetic-secret": "synthetic-secret" } } },
  ];
  for (const data of cases) {
    const result = parse(data);
    assert.ok(result.issues.length > 0, JSON.stringify(data));
    assert.ok(result.issues.every((issue) => issue.code === "invalid_config"));
    assert.doesNotMatch(JSON.stringify(result.issues), /synthetic-secret/);
  }
});

test("malformed JSON messages never include parser excerpts", () => {
  for (const source of ['{"secret":"synthetic-secret",}', "synthetic-secret", ""]) {
    const result = parseConfiguration(source, "rules.json");
    assert.equal(result.issues[0].code, "invalid_config");
    assert.doesNotMatch(JSON.stringify(result.issues), /synthetic-secret/);
  }
  assert.equal(parseConfiguration('\uFEFF{"variables":{}}', "rules.json").issues.length, 0);
});

test("handles prototype-like variable names as ordinary keys", () => {
  const result = parseConfiguration('{"variables":{"__proto__":{"required":false},"constructor":{}}}', "rules.json");
  assert.equal(result.issues.length, 0);
  assert.equal(result.rules.get("__proto__").required, false);
  assert.equal(result.rules.get("constructor").required, undefined);
});
