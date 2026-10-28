import type { Issue, ParsedEnvironment } from "./types.js";

function decodeDoubleQuoted(value: string): string {
  return value.replace(/\\([nrt"\\])/g, (_, escaped: string) => {
    switch (escaped) {
      case "n": return "\n";
      case "r": return "\r";
      case "t": return "\t";
      default: return escaped;
    }
  });
}

function parseValue(raw: string): string | undefined {
  const quote = raw[0];
  if (quote !== "'" && quote !== '"') {
    return raw.split("#", 1)[0]!.trim();
  }

  for (let index = 1; index < raw.length; index++) {
    if (quote === '"' && raw[index] === "\\") {
      index++;
      continue;
    }
    if (raw[index] !== quote) continue;
    const tail = raw.slice(index + 1).trim();
    if (tail !== "" && !tail.startsWith("#")) return undefined;
    const value = raw.slice(1, index);
    return quote === '"' ? decodeDoubleQuoted(value) : value;
  }
  return undefined;
}

/** Single-line dotenv syntax; never includes source text in diagnostics. */
export function parseEnvironment(source: string, file: string): ParsedEnvironment {
  const entries: ParsedEnvironment["entries"] = new Map();
  const issues: Issue[] = [];
  const firstLines = new Map<string, number>();
  const lines = source.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/);

  lines.forEach((sourceLine, index) => {
    const line = index + 1;
    const text = sourceLine.trim();
    if (text === "" || text.startsWith("#")) return;
    const match = /^(?:export[ \t]+)?([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*(.*)$/.exec(text);
    const value = match ? parseValue(match[2]!) : undefined;
    if (!match || value === undefined) {
      issues.push({
        code: "malformed", severity: "error", file, line,
        message: "Use KEY=value with a valid key and balanced single-line quotes.",
      });
      return;
    }

    const key = match[1]!;
    const firstLine = firstLines.get(key);
    if (firstLine !== undefined) {
      issues.push({
        code: "duplicate", severity: "error", key, file, line,
        message: `Already declared on line ${firstLine}; keep one declaration.`,
      });
    } else {
      firstLines.set(key, line);
    }
    // Like common dotenv loaders, the last valid declaration wins.
    entries.set(key, { value, line });
  });

  return { file, entries, issues };
}
