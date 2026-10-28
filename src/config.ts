import { KEY_PATTERN, type Issue, type Rules, type VariableRule } from "./types.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseConfiguration(source: string, file: string): { rules: Rules; issues: Issue[] } {
  const rules: Rules = new Map();
  const issues: Issue[] = [];
  const invalid = (message: string, key?: string): void => {
    issues.push({ code: "invalid_config", severity: "error", file, message, ...(key ? { key } : {}) });
  };

  let data: unknown;
  try {
    data = JSON.parse(source.replace(/^\uFEFF/, "")) as unknown;
  } catch {
    // JSON.parse error messages can contain portions of secrets.
    invalid("Configuration must be valid JSON; check commas, quotes, and braces.");
    return { rules, issues };
  }

  if (!isObject(data) || !isObject(data.variables)) {
    invalid('Expected an object containing a "variables" object.');
    return { rules, issues };
  }
  if (Object.keys(data).some((key) => key !== "variables")) {
    invalid('Only "variables" is allowed at the top level.');
  }

  for (const [key, rule] of Object.entries(data.variables)) {
    if (!KEY_PATTERN.test(key)) {
      invalid("Variable names must match [A-Za-z_][A-Za-z0-9_]*.");
      continue;
    }
    if (!isObject(rule)) {
      invalid("Each variable rule must be an object.", key);
      continue;
    }
    if (Object.keys(rule).some((field) => !["required", "type", "allowEmpty"].includes(field))) {
      invalid("Use only required, type, and allowEmpty in a variable rule.", key);
    }
    for (const field of ["required", "allowEmpty"] as const) {
      if (Object.hasOwn(rule, field) && typeof rule[field] !== "boolean") {
        invalid(`${field} must be a boolean.`, key);
      }
    }
    if (Object.hasOwn(rule, "type") &&
        (typeof rule.type !== "string" || !["string", "number", "boolean", "url"].includes(rule.type))) {
      invalid("type must be string, number, boolean, or url.", key);
    }
    // Rules are consumed only when the entire configuration is valid.
    rules.set(key, rule as VariableRule);
  }
  return { rules, issues };
}
