# envlint

A small CLI that catches environment file mistakes before your application starts.
Written in TypeScript with **zero runtime dependencies**. Diagnostics show key names
and locations, never environment values or source excerpts.

## Features

- Compare `.env` with `.env.example`, or choose your own paths.
- Find missing, empty, unexpected, duplicate, and malformed declarations.
- Validate strings, finite decimal numbers, booleans, and HTTP/HTTPS URLs.
- Mark variables optional or allow empty values with `.envlint.json`.
- Use readable terminal output or JSON, with predictable exit codes.
- Run on Windows, macOS, and Linux with Node.js 22 or newer and npm.

## Install from source

This project is not published to npm. Clone it and link the local executable:

```sh
git clone https://github.com/pulkitdotio/envlint.git
cd envlint
npm ci
npm run build
npm link
envlint --help
```

On Windows PowerShell, use `npm.cmd` and `envlint.cmd` if your execution policy
blocks npm's PowerShell shims. You can also run `node /path/to/envlint/dist/bin.js`
without linking. The package is marked private to prevent accidental npm publication.

## Quick start

In your application's directory, commit an example file containing only fictional
placeholders:

```dotenv
# .env.example
PORT=3000
API_URL=https://api.example.com
API_TOKEN=replace-me
```

Create an untracked `.env` with your actual configuration, then run:

```sh
envlint
envlint --strict
```

Run it before starting an application, for example in that application's `package.json`:

```json
{
  "scripts": {
    "prestart": "envlint --strict",
    "start": "node app.js"
  }
}
```

The command must be on your PATH, for example through the local link above.
Example values are never compared with configured values or type-checked. They
define expected **key names**; replace placeholders before using them in an app.
envlint does not detect placeholder values or verify credentials.

## Commands

| Command / flag | Behavior |
| --- | --- |
| `envlint` | Read `.env`, `.env.example`, and optional `.envlint.json` |
| `--env <path>` | Choose the environment file |
| `--example <path>` | Choose the example file |
| `--config <path>` | Choose a rules file; this file must exist |
| `--strict` | Turn unexpected-key warnings into errors |
| `--json` | Write only JSON, including usage and file errors |
| `--help`, `-h` | Show usage without reading environment files |
| `--version`, `-v` | Show the package version |

```sh
envlint --env .env.staging --example .env.example --config rules.json --strict
envlint --env="config/env file" --json
```

All paths are relative to the current working directory. `--flag=value` syntax
is supported for paths. Unknown flags, positional arguments, empty paths, and
repeated flags are usage errors. When both help and version are requested, help wins.

## Configuration

Place `.envlint.json` in the current directory, or pass `--config <path>`:

```json
{
  "variables": {
    "PORT": { "required": true, "type": "number" },
    "DEBUG": { "type": "boolean" },
    "API_URL": { "type": "url" },
    "API_TOKEN": { "type": "string", "allowEmpty": false },
    "LABEL": { "required": false, "allowEmpty": true }
  }
}
```

The expected keys are the union of the example keys and configured keys. A rule
can introduce a key that is absent from the example; it will not be unexpected.

| Rule | Default | Meaning |
| --- | --- | --- |
| `required` | `true` | The key must be declared; `false` permits it to be absent |
| `type` | No type check | One of `string`, `number`, `boolean`, `url` |
| `allowEmpty` | `false` | Accept empty or whitespace-only values and skip their type check |

`required` controls presence; `allowEmpty` controls present values. An optional
key with an empty value still fails unless `allowEmpty` is true. A required key
must exist even if `allowEmpty` is true. Without rules, all example keys must
exist and have nonempty values. Unexpected keys receive only an unexpected-key
diagnostic, without type or emptiness checks.

Configuration must be a JSON object with a `variables` object. Rules must be
objects; unknown properties, invalid key names, and incorrect rule types are
errors. JSON comments and trailing commas are not supported. An absent default
configuration is allowed; an unreadable default or absent explicit configuration
is an error. Duplicate JSON properties follow JSON's last-property-wins behavior.

### Type rules

Types apply to parsed `.env` values only. Whitespace inside quotes is preserved
and is not trimmed for type checks. All-whitespace values follow `allowEmpty`.

| Type | Accepted values |
| --- | --- |
| `string` | Any nonempty string, unless `allowEmpty` permits empty values |
| `number` | Finite base-10 numbers, including signs, decimals, and exponents: `-1`, `.5`, `1.`, `2e3` |
| `boolean` | Exactly `true` or `false`, lowercase |
| `url` | A Node.js WHATWG URL with an explicit `http://` or `https://` prefix, a hostname, and no whitespace |

Numbers reject hexadecimal, separators, `NaN`, `Infinity`, overflow, and partial
numbers such as `42px`. URLs are checked syntactically; envlint makes no network
requests and does not check reachability.

## Dotenv syntax

```dotenv
# Blank lines and full-line comments are ignored.
export APP_NAME = demo
TOKEN=fictional=value=with=equals
LABEL='literal # content' # inline comment
MESSAGE="escaped \"quote\" and newline\n"
```

- Keys match `[A-Za-z_][A-Za-z0-9_]*`; names are case-sensitive.
- Spaces around assignments are ignored. `export` is optional.
- LF, CRLF, standalone CR, and an initial UTF-8 BOM are supported.
- Outside quotes, `#` starts a comment, even without a preceding space. Quote
  values that contain a literal `#`.
- Single-quoted values are literal. Double-quoted values decode `\n`, `\r`,
  `\t`, `\"`, and `\\`; other backslash sequences stay literal.
- Quotes must balance on the same physical line. After a closing quote, only
  whitespace or a comment is permitted.
- Duplicate declarations are errors in **both** files. The last valid declaration
  supplies the value for subsequent checks; diagnostics reference the first line.
- No variable expansion, command execution, or shell evaluation occurs.

## Output

For a file with an empty `API_TOKEN`, missing `PORT`, and extra `EXTRA`:

```text
envlint: validation failed
  [error] empty API_TOKEN (/app/.env:1): Value is empty; set a value or enable allowEmpty.
  [error] missing PORT (/app/.env): Required variable is missing; add a declaration.
  [warning] unexpected EXTRA (/app/.env:2): Not declared in the example or configuration; remove it or add a rule.
2 errors, 1 warning
```

Locations are absolute paths. Colors are used on interactive terminals unless
`NO_COLOR` is set or `TERM=dumb`. Control characters in terminal paths are escaped.
Validation reports go to stdout; operational errors go to stderr.

With `--json`, all reports go to stdout with no ANSI codes or decorative logs;
stderr is empty during normal operation:

```json
{
  "status": "failed",
  "errors": 1,
  "warnings": 0,
  "issues": [
    {
      "code": "missing",
      "severity": "error",
      "key": "PORT",
      "file": "/app/.env",
      "message": "Required variable is missing; add a declaration."
    }
  ]
}
```

`status` is `passed`, `failed`, or `error`. Each issue has `code`, `severity`,
and `message`, with `key`, `file`, and `line` when available. Issue codes are
`missing`, `empty`, `unexpected`, `duplicate`, `malformed`, `invalid_type`,
`invalid_config`, `file_error`, `usage`, and `internal_error`.
`--help --json` returns `{ "help": "..." }`; `--version --json` returns
`{ "version": "0.1.0" }`.

Reports contain no environment values or parser excerpts. Key names and file
paths are included, so do not place secrets in those names or paths.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Passed, possibly with warnings |
| `1` | Validation failed, including malformed or duplicate declarations |
| `2` | Invalid arguments, invalid configuration, file-reading error, or an operational failure |

File and configuration errors stop validation. Fix those first, then rerun to
see environment diagnostics.

## Development

```sh
npm ci
npm run check
npm run build
npm test
```

`npm test` builds and runs Node's built-in test runner. `npm run test:unit` runs
tests against an existing build. Tests use only synthetic data in temporary
directories and exercise both pure functions and real CLI processes.

```text
src/
  arguments.ts   CLI options and help
  bin.ts         Executable entry point
  cli.ts         CLI orchestration
  config.ts      Configuration validation
  files.ts       Filesystem loading
  parser.ts      Dotenv parsing
  report.ts      Human and JSON reports
  types.ts       Shared types
  validate.ts    Pure validation rules
test/           Parser, configuration, validation, and CLI tests
.github/workflows/ci.yml
```

CI checks types, builds, and tests on Node.js 22, 24, and 26, across Linux,
Windows, and macOS. Generated `dist/` and `node_modules/` are not committed.
Rebuild after source changes when using `npm link`.

## Limitations

envlint validates files, not `process.env`; it does not merge layered dotenv files
or launch your application. Multiline quoted values, shell syntax, interpolation,
custom types, and semantic constraints such as numeric ranges are outside its
scope. Files are read as UTF-8. It does not replace secret scanning or application
configuration validation.

## License

[MIT](LICENSE), copyright 2026 pulkitdotio.
