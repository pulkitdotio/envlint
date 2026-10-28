import type { Issue, ParsedEnvironment, Rules, VariableType } from "./types.js";

function matchesType(value: string, type: VariableType): boolean {
  switch (type) {
    case "string": return true;
    case "boolean": return value === "true" || value === "false";
    case "number":
      return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) && Number.isFinite(Number(value));
    case "url":
      if (!/^https?:\/\//i.test(value) || /\s/.test(value)) return false;
      try {
        const url = new URL(value);
        return (url.protocol === "http:" || url.protocol === "https:") && url.hostname !== "";
      } catch {
        return false;
      }
  }
}

export function validateEnvironment(
  environment: ParsedEnvironment,
  example: ParsedEnvironment,
  rules: Rules = new Map(),
  strict = false,
): Issue[] {
  const issues: Issue[] = [...environment.issues, ...example.issues];
  const expected = new Set([...example.entries.keys(), ...rules.keys()]);

  for (const key of expected) {
    const rule = rules.get(key) ?? {};
    const declaration = environment.entries.get(key);
    if (!declaration) {
      if (rule.required ?? true) {
        issues.push({
          code: "missing", severity: "error", key, file: environment.file,
          message: "Required variable is missing; add a declaration.",
        });
      }
      continue;
    }

    const location = { key, file: environment.file, line: declaration.line };
    if (declaration.value.trim() === "") {
      if (!(rule.allowEmpty ?? false)) {
        issues.push({
          code: "empty", severity: "error", ...location,
          message: "Value is empty; set a value or enable allowEmpty.",
        });
      }
      continue;
    }
    if (rule.type && !matchesType(declaration.value, rule.type)) {
      issues.push({
        code: "invalid_type", severity: "error", ...location,
        message: `Expected type ${rule.type}; check the configured value.`,
      });
    }
  }

  for (const [key, declaration] of environment.entries) {
    if (!expected.has(key)) {
      issues.push({
        code: "unexpected", severity: strict ? "error" : "warning", key,
        file: environment.file, line: declaration.line,
        message: "Not declared in the example or configuration; remove it or add a rule.",
      });
    }
  }
  return issues;
}
