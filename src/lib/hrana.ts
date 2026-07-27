/** Hrana over HTTP (libSQL) value + statement helpers. */

export type HranaValue =
  | { type: "null" }
  | { type: "integer"; value: string }
  | { type: "float"; value: number }
  | { type: "text"; value: string }
  | { type: "blob"; base64: string };

export type HranaError = { message: string; code?: string | null };

export type HranaCol = { name: string | null; decltype: string | null };

export type HranaStmtResult = {
  cols: HranaCol[];
  rows: HranaValue[][];
  affected_row_count: number;
  last_insert_rowid: string | null;
};

export type HranaNamedArg = { name: string; value: HranaValue };

export type HranaStmt = {
  sql?: string | null;
  sql_id?: number | null;
  args?: HranaValue[];
  named_args?: HranaNamedArg[];
  want_rows?: boolean;
};

export type HranaBatchCond =
  | { type: "ok"; step: number }
  | { type: "error"; step: number }
  | { type: "not"; cond: HranaBatchCond }
  | { type: "and"; conds: HranaBatchCond[] }
  | { type: "or"; conds: HranaBatchCond[] }
  | { type: "is_autocommit" };

export type HranaBatchStep = {
  condition?: HranaBatchCond | null;
  stmt: HranaStmt;
};

export type HranaBatch = { steps: HranaBatchStep[] };

export type HranaBatchResult = {
  step_results: Array<HranaStmtResult | null>;
  step_errors: Array<HranaError | null>;
};

export type StreamRequest =
  | { type: "close" }
  | { type: "execute"; stmt: HranaStmt }
  | { type: "batch"; batch: HranaBatch }
  | { type: "sequence"; sql?: string | null; sql_id?: number | null }
  | { type: "describe"; sql?: string | null; sql_id?: number | null }
  | { type: "store_sql"; sql_id: number; sql: string }
  | { type: "close_sql"; sql_id: number }
  | { type: "get_autocommit" };

export type StreamResponse =
  | { type: "close" }
  | { type: "execute"; result: HranaStmtResult }
  | { type: "batch"; result: HranaBatchResult }
  | { type: "sequence" }
  | { type: "describe"; result: DescribeResult }
  | { type: "store_sql" }
  | { type: "close_sql" }
  | { type: "get_autocommit"; is_autocommit: boolean };

export type DescribeResult = {
  params: Array<{ name: string | null }>;
  cols: Array<{ name: string; decltype: string | null }>;
  is_explain: boolean;
  is_readonly: boolean;
};

export type StreamResultOk = { type: "ok"; response: StreamResponse };
export type StreamResultError = { type: "error"; error: HranaError };
export type StreamResult = StreamResultOk | StreamResultError;

export class HranaProtoError extends Error {
  constructor(
    message: string,
    public code: string | null = "PROTOCOL",
  ) {
    super(message);
    this.name = "HranaProtoError";
  }
}

export function hranaError(
  message: string,
  code: string | null = null,
): HranaError {
  return { message, code };
}

/** Decode Hrana Value → JSON-serializable param for Cloudflare D1 REST. */
export function decodeHranaValue(v: HranaValue): unknown {
  switch (v.type) {
    case "null":
      return null;
    case "integer": {
      const s = v.value;
      if (!/^-?\d+$/.test(s)) {
        throw new HranaProtoError(`invalid integer value: ${s}`, "VALUE_ERROR");
      }
      const n = Number(s);
      if (Number.isSafeInteger(n)) return n;
      // D1 REST accepts numeric strings for large integers in practice.
      return s;
    }
    case "float":
      return v.value;
    case "text":
      return v.value;
    case "blob":
      return v.base64;
    default:
      throw new HranaProtoError(
        `unknown value type: ${(v as { type: string }).type}`,
        "VALUE_ERROR",
      );
  }
}

/** Encode a D1 /raw cell into Hrana Value. */
export function encodeHranaValue(cell: unknown): HranaValue {
  if (cell === null || cell === undefined) return { type: "null" };
  if (typeof cell === "boolean") {
    return { type: "integer", value: cell ? "1" : "0" };
  }
  if (typeof cell === "number") {
    if (Number.isFinite(cell) && Number.isInteger(cell)) {
      return { type: "integer", value: String(cell) };
    }
    return { type: "float", value: cell };
  }
  if (typeof cell === "bigint") {
    return { type: "integer", value: cell.toString() };
  }
  if (typeof cell === "string") return { type: "text", value: cell };
  if (cell instanceof ArrayBuffer || ArrayBuffer.isView(cell)) {
    const bytes =
      cell instanceof ArrayBuffer
        ? new Uint8Array(cell)
        : new Uint8Array(
            (cell as ArrayBufferView).buffer,
            (cell as ArrayBufferView).byteOffset,
            (cell as ArrayBufferView).byteLength,
          );
    return { type: "blob", base64: bytesToBase64(bytes) };
  }
  // Fallback: stringify unknown objects rather than crash the pipeline.
  return { type: "text", value: JSON.stringify(cell) };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

/**
 * Rewrite named SQLite placeholders to positional `?` and build params.
 * Supports `:name`, `@name`, `$name`. Leaves `?` / `?NNN` alone (positional).
 */
export function bindStmtArgs(stmt: HranaStmt): {
  sql: string;
  params: unknown[];
} {
  const sql = stmt.sql;
  if (!sql || typeof sql !== "string") {
    throw new HranaProtoError("statement requires sql", "SQL_INPUT_ERROR");
  }

  const positional = (stmt.args ?? []).map(decodeHranaValue);
  const namedList = stmt.named_args ?? [];

  if (namedList.length === 0) {
    return { sql, params: positional };
  }

  const named = new Map<string, unknown>();
  for (const a of namedList) {
    const raw = a.name.startsWith(":") || a.name.startsWith("@") || a.name.startsWith("$")
      ? a.name.slice(1)
      : a.name;
    const value = decodeHranaValue(a.value);
    named.set(raw, value);
    named.set(a.name, value);
  }

  const params: unknown[] = [];
  let out = "";
  let i = 0;
  let positionalIndex = 0;

  while (i < sql.length) {
    const ch = sql[i]!;

    // Skip string literals
    if (ch === "'" || ch === '"') {
      const quote = ch;
      out += ch;
      i += 1;
      while (i < sql.length) {
        out += sql[i];
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) {
            out += sql[i + 1];
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    // Skip line comments
    if (ch === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") {
        out += sql[i];
        i += 1;
      }
      continue;
    }

    // Skip block comments
    if (ch === "/" && sql[i + 1] === "*") {
      out += "/*";
      i += 2;
      while (i < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) {
        out += sql[i];
        i += 1;
      }
      if (i < sql.length) {
        out += "*/";
        i += 2;
      }
      continue;
    }

    // Positional ? or ?NNN
    if (ch === "?") {
      let j = i + 1;
      while (j < sql.length && sql[j]! >= "0" && sql[j]! <= "9") j += 1;
      const numPart = sql.slice(i + 1, j);
      out += "?";
      if (numPart) {
        const n = Number(numPart);
        if (n < 1 || n > positional.length) {
          throw new HranaProtoError(
            `parameter ?${numPart} out of range`,
            "ARGS_ERROR",
          );
        }
        params.push(positional[n - 1]);
      } else {
        if (positionalIndex >= positional.length) {
          throw new HranaProtoError(
            "not enough positional arguments",
            "ARGS_ERROR",
          );
        }
        params.push(positional[positionalIndex]!);
        positionalIndex += 1;
      }
      i = j;
      continue;
    }

    // Named :name @name $name
    if (
      (ch === ":" || ch === "@" || ch === "$") &&
      i + 1 < sql.length &&
      /[A-Za-z_]/.test(sql[i + 1]!)
    ) {
      let j = i + 1;
      while (j < sql.length && /[A-Za-z0-9_]/.test(sql[j]!)) j += 1;
      const full = sql.slice(i, j);
      const bare = full.slice(1);
      const value = named.has(full)
        ? named.get(full)
        : named.has(bare)
          ? named.get(bare)
          : undefined;
      if (value === undefined) {
        throw new HranaProtoError(
          `missing named argument ${full}`,
          "ARGS_ERROR",
        );
      }
      out += "?";
      params.push(value);
      i = j;
      continue;
    }

    out += ch;
    i += 1;
  }

  return { sql: out, params };
}

export function buildStmtResult(
  columns: string[],
  rows: unknown[][],
  meta: { changes?: number; last_row_id?: number } | undefined,
  wantRows: boolean,
): HranaStmtResult {
  const cols: HranaCol[] = columns.map((name) => ({
    name: name ?? null,
    decltype: null,
  }));
  const encodedRows = wantRows
    ? rows.map((row) => row.map((cell) => encodeHranaValue(cell)))
    : [];
  const lastId = meta?.last_row_id;
  return {
    cols,
    rows: encodedRows,
    affected_row_count: meta?.changes ?? 0,
    last_insert_rowid:
      lastId === undefined || lastId === null ? null : String(lastId),
  };
}

export function evalBatchCond(
  cond: HranaBatchCond,
  stepResults: Array<HranaStmtResult | null>,
  stepErrors: Array<HranaError | null>,
): boolean {
  switch (cond.type) {
    case "ok": {
      const i = cond.step;
      return i >= 0 && i < stepResults.length && stepResults[i] != null;
    }
    case "error": {
      const i = cond.step;
      return i >= 0 && i < stepErrors.length && stepErrors[i] != null;
    }
    case "not":
      return !evalBatchCond(cond.cond, stepResults, stepErrors);
    case "and":
      return cond.conds.every((c) =>
        evalBatchCond(c, stepResults, stepErrors),
      );
    case "or":
      return cond.conds.some((c) => evalBatchCond(c, stepResults, stepErrors));
    case "is_autocommit":
      // No sticky streams / interactive txns — always autocommit.
      return true;
    default:
      throw new HranaProtoError(
        `unknown batch condition: ${(cond as { type: string }).type}`,
        "PROTOCOL",
      );
  }
}

/** Split a SQL script on semicolons, respecting quotes/comments. */
export function splitSqlStatements(script: string): string[] {
  const out: string[] = [];
  let current = "";
  let i = 0;
  while (i < script.length) {
    const ch = script[i]!;
    if (ch === "'" || ch === '"') {
      const quote = ch;
      current += ch;
      i += 1;
      while (i < script.length) {
        current += script[i];
        if (script[i] === quote) {
          if (script[i + 1] === quote) {
            current += script[i + 1];
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (ch === "-" && script[i + 1] === "-") {
      while (i < script.length && script[i] !== "\n") {
        current += script[i];
        i += 1;
      }
      continue;
    }
    if (ch === "/" && script[i + 1] === "*") {
      current += "/*";
      i += 2;
      while (
        i < script.length &&
        !(script[i] === "*" && script[i + 1] === "/")
      ) {
        current += script[i];
        i += 1;
      }
      if (i < script.length) {
        current += "*/";
        i += 2;
      }
      continue;
    }
    if (ch === ";") {
      const trimmed = current.trim();
      if (trimmed) out.push(trimmed);
      current = "";
      i += 1;
      continue;
    }
    current += ch;
    i += 1;
  }
  const trimmed = current.trim();
  if (trimmed) out.push(trimmed);
  return out;
}

/**
 * Detect write-ish SQL for anon_readonly gating.
 * Intentionally conservative: WITH…INSERT etc. count as writes.
 */
export function isWriteSql(sql: string): boolean {
  const stripped = sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .trim()
    .toLowerCase();
  if (!stripped) return false;
  if (/^(select|values|explain|pragma)\b/.test(stripped)) {
    // SELECT … FOR UPDATE is still a write intent in some dialects; SQLite ignores it.
    return false;
  }
  if (stripped.startsWith("with")) {
    return /\b(insert|update|delete|replace|create|drop|alter|truncate)\b/.test(
      stripped,
    );
  }
  return /^(insert|update|delete|replace|create|drop|alter|truncate|begin|commit|rollback|savepoint|release|analyze|reindex|vacuum|attach|detach)\b/.test(
    stripped,
  );
}
