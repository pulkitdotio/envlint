import { HELP, parseArguments } from "./arguments.js";
import { loadProject } from "./files.js";
import { parseEnvironment } from "./parser.js";
import { createReport, formatHuman, formatJson } from "./report.js";
import type { Report } from "./types.js";
import { validateEnvironment } from "./validate.js";

export async function runCli(args: string[], version: string): Promise<number> {
  // Preserve JSON output even when parsing other arguments fails.
  let json = args.some((arg) => arg === "--json" || arg.startsWith("--json="));
  const print = (report: Report): void => {
    if (json) {
      process.stdout.write(formatJson(report));
    } else {
      const stream = report.status === "error" ? process.stderr : process.stdout;
      const color = Boolean(stream.isTTY) && process.env.NO_COLOR === undefined && process.env.TERM !== "dumb";
      stream.write(formatHuman(report, color));
    }
  };

  let options;
  try {
    options = parseArguments(args);
  } catch {
    print(createReport([{
      code: "usage", severity: "error",
      message: "Invalid arguments. Use supported flags once, provide nonempty paths, and see --help.",
    }], true));
    return 2;
  }
  json = options.json;
  if (options.help || options.version) {
    const data = options.help ? { help: HELP } : { version };
    process.stdout.write(json ? `${JSON.stringify(data)}\n` : options.help ? HELP : `${version}\n`);
    return 0;
  }

  try {
    const loaded = await loadProject(options, process.cwd());
    if (loaded.issues.length > 0) {
      print(createReport(loaded.issues, true));
      return 2;
    }
    const environment = parseEnvironment(loaded.environment.source, loaded.environment.file);
    const example = parseEnvironment(loaded.example.source, loaded.example.file);
    const issues = validateEnvironment(environment, example, loaded.rules, options.strict);
    const report = createReport(issues);
    print(report);
    return report.errors > 0 ? 1 : 0;
  } catch {
    print(createReport([{
      code: "internal_error", severity: "error",
      message: "Unable to complete validation. Check file access and retry.",
    }], true));
    return 2;
  }
}
