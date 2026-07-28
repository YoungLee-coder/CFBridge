/** Split a SQL script into individual statements (semicolon-separated, quote-aware). */
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

function isSingleWriteSql(sql: string): boolean {
  const stripped = sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .trim()
    .toLowerCase();
  if (!stripped) return false;
  if (/^(select|values|explain|pragma)\b/.test(stripped)) {
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

/** Detect write-ish SQL. Multi-statement scripts count as write if any statement is a write. */
export function isWriteSql(sql: string): boolean {
  const statements = splitSqlStatements(sql);
  if (statements.length === 0) return isSingleWriteSql(sql);
  return statements.some(isSingleWriteSql);
}
