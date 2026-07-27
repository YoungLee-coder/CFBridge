export function generateId(): string {
  return crypto.randomUUID();
}

export function generateRef(length = 8): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const b of bytes) {
    out += alphabet[b % alphabet.length];
  }
  return out;
}

export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aa = enc.encode(a);
  const bb = enc.encode(b);
  if (aa.byteLength !== bb.byteLength) {
    // still compare to avoid leaking length via early return timing of hash paths
    let diff = aa.byteLength ^ bb.byteLength;
    const len = Math.max(aa.byteLength, bb.byteLength);
    for (let i = 0; i < len; i++) {
      diff |= (aa[i] ?? 0) ^ (bb[i] ?? 0);
    }
    return diff === 0;
  }
  let diff = 0;
  for (let i = 0; i < aa.byteLength; i++) {
    diff |= aa[i]! ^ bb[i]!;
  }
  return diff === 0;
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function generateApiKey(role: "anon" | "service_role"): {
  key: string;
  prefix: string;
} {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const body = [...bytes]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const tag = role === "service_role" ? "sk" : "ak";
  const key = `cfb_${tag}_${body}`;
  return { key, prefix: key.slice(0, 12) };
}

function base64UrlEncode(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  const pad = "=".repeat((4 - (str.length % 4)) % 4);
  const b64 = (str + pad).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function hmacSign(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return base64UrlEncode(sig);
}

export async function createAdminSessionToken(
  secret: string,
  ttlSeconds = 60 * 60 * 24 * 7,
): Promise<string> {
  const header = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  );
  const now = Math.floor(Date.now() / 1000);
  const body = base64UrlEncode(
    new TextEncoder().encode(
      JSON.stringify({ role: "admin", iat: now, exp: now + ttlSeconds }),
    ),
  );
  const signingInput = `${header}.${body}`;
  const sig = await hmacSign(secret, signingInput);
  return `${signingInput}.${sig}`;
}

export async function verifyAdminSessionToken(
  secret: string,
  token: string,
): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [header, body, sig] = parts as [string, string, string];
  const expected = await hmacSign(secret, `${header}.${body}`);
  if (!timingSafeEqual(sig, expected)) return false;
  try {
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(body)),
    ) as { role?: string; exp?: number };
    if (payload.role !== "admin") return false;
    if (typeof payload.exp !== "number") return false;
    if (payload.exp < Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch {
    return false;
  }
}

export function isValidRef(ref: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{1,31}$/.test(ref);
}
