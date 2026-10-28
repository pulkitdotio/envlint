import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Options } from "./arguments.js";
import { parseConfiguration } from "./config.js";
import type { Issue, Rules } from "./types.js";

export async function loadProject(options: Options, cwd: string): Promise<{
  environment: { file: string; source: string };
  example: { file: string; source: string };
  rules: Rules;
  issues: Issue[];
}> {
  const issues: Issue[] = [];
  const read = async (file: string, label: string, optional = false): Promise<string | undefined> => {
    try {
      return await readFile(file, "utf8");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (optional && code === "ENOENT") return undefined;
      const reason = code === "ENOENT" ? "file does not exist"
        : code === "EACCES" || code === "EPERM" ? "permission denied"
        : code === "EISDIR" ? "path is a directory" : "file is not readable";
      issues.push({
        code: "file_error", severity: "error", file,
        message: `Cannot read ${label}: ${reason}.`,
      });
      return undefined;
    }
  };

  const envFile = resolve(cwd, options.env);
  const exampleFile = resolve(cwd, options.example);
  const configFile = resolve(cwd, options.config);
  // Sequential reads keep diagnostic ordering stable across platforms.
  const envSource = await read(envFile, "environment file");
  const exampleSource = await read(exampleFile, "example file");
  const configSource = await read(configFile, "configuration file", !options.explicitConfig);
  let rules: Rules = new Map();
  if (configSource !== undefined) {
    const config = parseConfiguration(configSource, configFile);
    rules = config.rules;
    issues.push(...config.issues);
  }
  return {
    environment: { file: envFile, source: envSource ?? "" },
    example: { file: exampleFile, source: exampleSource ?? "" },
    rules, issues,
  };
}
