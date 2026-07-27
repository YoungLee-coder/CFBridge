import { isLocale, type Locale } from "@cfbridge/shared";

const LOCALE_KEY = "locale";

export async function getLocale(db: D1Database): Promise<Locale | null> {
  try {
    const row = await db
      .prepare("SELECT value FROM instance_settings WHERE key = ?")
      .bind(LOCALE_KEY)
      .first<{ value: string }>();
    if (!row?.value || !isLocale(row.value)) return null;
    return row.value;
  } catch {
    // Table may not exist until migration 0002 is applied.
    return null;
  }
}

export async function setLocale(db: D1Database, locale: Locale): Promise<void> {
  await db
    .prepare(
      `INSERT INTO instance_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .bind(LOCALE_KEY, locale)
    .run();
}
