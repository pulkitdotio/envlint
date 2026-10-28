export type IssueCode =
  | "missing"
  | "empty"
  | "unexpected"
  | "duplicate"
  | "malformed"
  | "invalid_type"
  | "invalid_config"
  | "file_error"
  | "usage"
  | "internal_error";

// Reports deliberately have no value or source-text fields.
export interface Issue {
  code: IssueCode;
  severity: "error" | "warning";
  message: string;
  key?: string;
  file?: string;
  line?: number;
}

export interface Declaration {
  value: string;
  line: number;
}

export interface ParsedEnvironment {
  file: string;
  entries: Map<string, Declaration>;
  issues: Issue[];
}

export type VariableType = "string" | "number" | "boolean" | "url";

export interface VariableRule {
  required?: boolean;
  type?: VariableType;
  allowEmpty?: boolean;
}

export type Rules = Map<string, VariableRule>;

export interface Report {
  status: "passed" | "failed" | "error";
  errors: number;
  warnings: number;
  issues: Issue[];
}

export const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
