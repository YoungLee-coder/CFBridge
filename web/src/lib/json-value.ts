export function tryParseJson(text: string): unknown | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

export function formatJson(text: string): string | null {
  const parsed = tryParseJson(text);
  if (parsed === undefined) return null;
  return JSON.stringify(parsed, null, 2);
}
