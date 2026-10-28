import type { Issue, Report } from "./types.js";

export function createReport(issues: Issue[], operational = false): Report {
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.length - errors;
  return { status: operational ? "error" : errors > 0 ? "failed" : "passed", errors, warnings, issues };
}

function safeText(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

export function formatHuman(report: Report, color = false): string {
  const paint = (text: string, code: number): string => color ? `\u001b[${code}m${text}\u001b[0m` : text;
  const status = report.status === "error" ? "could not validate" : `validation ${report.status}`;
  const lines = [paint(`envlint: ${status}`, report.errors > 0 ? 31 : 32)];
  for (const issue of report.issues) {
    const label = paint(`[${issue.severity}]`, issue.severity === "error" ? 31 : 33);
    const key = issue.key ? ` ${issue.key}` : "";
    const location = issue.file ? ` (${safeText(issue.file)}${issue.line ? `:${issue.line}` : ""})` : "";
    lines.push(`  ${label} ${issue.code}${key}${location}: ${issue.message}`);
  }
  lines.push(`${report.errors} error${report.errors === 1 ? "" : "s"}, ${report.warnings} warning${report.warnings === 1 ? "" : "s"}`);
  return `${lines.join("\n")}\n`;
}

export function formatJson(report: Report): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
