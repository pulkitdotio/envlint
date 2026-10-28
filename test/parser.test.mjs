import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEnvironment } from "../dist/parser.js";

const parse = (source) => parseEnvironment(source, "fixture.env");

test("parses comments, whitespace, exports, CRLF, BOM, equals, and quoted hashes", () => {
  const result = parse([
    "\uFEFF# synthetic fixture",
    "",
    "  export APP_NAME = sample app # comment",
    "TOKEN=fictional=a=b=c",
    "SINGLE='literal # content' # comment",
    'DOUBLE="quoted # content"#comment',
    "UNQUOTED=before#comment",
    "EMPTY= # comment",
    "  SPACES = '  preserved  '  ",
  ].join("\r\n"));
  assert.deepEqual(result.issues, []);
  assert.deepEqual([...result.entries].map(([key, entry]) => [key, entry.value]), [
    ["APP_NAME", "sample app"], ["TOKEN", "fictional=a=b=c"],
    ["SINGLE", "literal # content"], ["DOUBLE", "quoted # content"],
    ["UNQUOTED", "before"], ["EMPTY", ""], ["SPACES", "  preserved  "],
  ]);
  assert.equal(result.entries.get("APP_NAME").line, 3);
});

test("decodes documented double-quote escapes and keeps single quotes literal", () => {
  const result = parse(String.raw`DOUBLE="line\nnext\r\t\"quote\"\\end\q"
SINGLE='line\nnext'
PATH=C:\synthetic\folder`);
  assert.deepEqual(result.issues, []);
  assert.equal(result.entries.get("DOUBLE").value, 'line\nnext\r\t"quote"\\end\\q');
  assert.equal(result.entries.get("SINGLE").value, String.raw`line\nnext`);
  assert.equal(result.entries.get("PATH").value, String.raw`C:\synthetic\folder`);
});

test("finds duplicates with first and current line numbers; last valid value wins", () => {
  const result = parse("KEY=one\nKEY=two\nKEY=three\n");
  assert.equal(result.entries.get("KEY").value, "three");
  assert.deepEqual(result.issues.map(({ code, line }) => [code, line]), [["duplicate", 2], ["duplicate", 3]]);
  assert.ok(result.issues.every((issue) => issue.message.includes("line 1")));
});

test("malformed declarations report safe line diagnostics without raw content", () => {
  const invalid = [
    "synthetic-secret-without-assignment",
    "9BAD=synthetic-secret-invalid-key",
    "export WRONG",
    'UNCLOSED="synthetic-secret-open',
    "TRAILING='synthetic-secret-tail'junk",
    String.raw`ESCAPED="synthetic-secret-escaped\"`,
    "KEY: synthetic-secret-colon",
  ];
  const result = parse(invalid.join("\n"));
  assert.equal(result.entries.size, 0);
  assert.deepEqual(result.issues.map((issue) => issue.line), [1, 2, 3, 4, 5, 6, 7]);
  assert.ok(result.issues.every((issue) => issue.code === "malformed"));
  assert.doesNotMatch(JSON.stringify(result.issues), /synthetic-secret/);
});

test("rejects multiline values and handles LF and standalone CR", () => {
  assert.equal(parse('KEY="first\nsecond"').issues.length, 2);
  assert.equal(parse("ONE=1\rTWO=2\nTHREE=3").entries.size, 3);
});

test("treats shell expansion and command substitution as literal strings", () => {
  const result = parse('KEY=${OTHER}\nCOMMAND=$(echo fictional)\nBACKTICK=`fictional`');
  assert.deepEqual(result.issues, []);
  assert.equal(result.entries.get("KEY").value, "${OTHER}");
  assert.equal(result.entries.get("COMMAND").value, "$(echo fictional)");
});
