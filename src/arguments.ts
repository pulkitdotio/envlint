import { parseArgs } from "node:util";

export interface Options {
  env: string;
  example: string;
  config: string;
  explicitConfig: boolean;
  strict: boolean;
  json: boolean;
  help: boolean;
  version: boolean;
}

export const HELP = `envlint - validate environment files without exposing values

Usage: envlint [options]

  --env <path>      Environment file (default: .env)
  --example <path>  Expected keys (default: .env.example)
  --config <path>   Rules file (default: optional .envlint.json)
  --strict         Treat unexpected variables as errors
  --json           Output JSON only, including operational errors
  --help, -h       Show help
  --version, -v    Show version

Paths are relative to the current working directory.
Exit codes: 0 passed, 1 validation failed, 2 usage/configuration/file error.
`;

export function parseArguments(args: string[]): Options {
  const { values, tokens } = parseArgs({
    args, strict: true, allowPositionals: false, tokens: true,
    options: {
      env: { type: "string" },
      example: { type: "string" },
      config: { type: "string" },
      strict: { type: "boolean" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });
  const seen = new Set<string>();
  for (const token of tokens) {
    if (token.kind !== "option") continue;
    if (seen.has(token.name)) throw new Error("Repeated option.");
    seen.add(token.name);
  }
  for (const value of [values.env, values.example, values.config]) {
    if (value !== undefined && (value.trim() === "" || value.includes("\0"))) {
      throw new Error("Invalid path.");
    }
  }
  return {
    env: values.env ?? ".env",
    example: values.example ?? ".env.example",
    config: values.config ?? ".envlint.json",
    explicitConfig: values.config !== undefined,
    strict: values.strict ?? false,
    json: values.json ?? false,
    help: values.help ?? false,
    version: values.version ?? false,
  };
}
