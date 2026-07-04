import type { EntrainSessionV1 } from "@/format/entrain-format";
import {
  cleanForShare,
  sanitizeSession,
  sessionNeedsLocalFiles,
} from "@/format/entrain-format";
import { looksLikeSbagen, sbagenTextToSession } from "@/format/sbagen";
import {
  patternTextToSession,
  sessionToPatternText,
} from "@/format/pattern-text";

export type SharePayloadInfo = {
  hash: string;
  url: string;
  capsule: string;
  encoding: "raw" | "gzip";
  bytes: number;
  chars: number;
  digest: string;
  portable: boolean;
  urlSafe: boolean;
  warnings: string[];
  sourceFormat?: "entrain-script.v1" | "sbagen.v1" | "compiled-json.v2";
};

/**
 * Private anonymous share formats.
 *
 * Source-first v1 URL: #src=v1.<format>.<encoding>.<digest>.<base64url-script>
 * Source-first capsule: ENTRAIN-SOURCE:v1:<format>:<encoding>:<digest>:<payload>
 *
 * Compiled-cache v2 URL: #es=v2.<encoding>.<digest>.<base64url-canonical-json-or-gzip>
 * Compiled-cache capsule: ENTRAIN:v2:<encoding>:<digest>:<payload>
 *
 * Both URL payloads live after #, so browsers do not send them to the server.
 * Studio now prefers source-first shares; compiled JSON remains readable for old links and debugging.
 */
export async function encodeSessionHash(session: EntrainSessionV1) {
  return (await encodeSourceUrl(session)).hash;
}

export async function encodeSourceUrl(
  session: EntrainSessionV1,
  baseUrl = location.origin + location.pathname,
): Promise<SharePayloadInfo> {
  const clean = cleanForShare(session);
  const warnings: string[] = [];
  const portable = !sessionNeedsLocalFiles(clean);
  if (!portable)
    warnings.push(
      "This session contains local ambience-file layers. The URL preserves their settings, but not the audio file bytes. Use procedural ambience for a fully exact anonymous share.",
    );

  const script = sessionToPatternText(clean);
  const raw = new TextEncoder().encode(script);
  const digest = await shortDigest(raw);
  let encoding: "raw" | "gzip" = "raw";
  let payload = raw;
  const gz = await gzip(raw).catch(() => null);
  if (gz && gz.length + 12 < raw.length) {
    encoding = "gzip";
    payload = gz;
  }
  const b64 = base64url(payload);
  const hash = `#src=v1.entrain.${encoding}.${digest}.${b64}`;
  const url = baseUrl + hash;
  const capsule = `ENTRAIN-SOURCE:v1:entrain:${encoding}:${digest}:${b64}`;
  const urlSafe = url.length <= 8_000;
  if (!urlSafe)
    warnings.push(
      "This URL is long. Use the copied source capsule as a fallback in messengers that truncate URLs.",
    );
  return {
    hash,
    url,
    capsule,
    encoding,
    bytes: payload.length,
    chars: url.length,
    digest,
    portable,
    urlSafe,
    warnings,
    sourceFormat: "entrain-script.v1",
  };
}

export async function encodeSessionUrl(
  session: EntrainSessionV1,
  baseUrl = location.origin + location.pathname,
): Promise<SharePayloadInfo> {
  const clean = cleanForShare(session);
  const warnings: string[] = [];
  const portable = !sessionNeedsLocalFiles(clean);
  if (!portable)
    warnings.push(
      "This session contains local ambience-file layers. The URL preserves their settings, but not the audio file bytes. Use procedural ambience for a fully exact anonymous share.",
    );

  const json = canonicalJson(clean);
  const raw = new TextEncoder().encode(json);
  const digest = await shortDigest(raw);
  let encoding: "raw" | "gzip" = "raw";
  let payload = raw;
  const gz = await gzip(raw).catch(() => null);
  if (gz && gz.length + 12 < raw.length) {
    encoding = "gzip";
    payload = gz;
  }
  const b64 = base64url(payload);
  const hash = `#es=v2.${encoding}.${digest}.${b64}`;
  const url = baseUrl + hash;
  const capsule = `ENTRAIN:v2:${encoding}:${digest}:${b64}`;
  const urlSafe = url.length <= 8_000;
  if (!urlSafe)
    warnings.push(
      "This URL is long. Use the copied capsule code as a fallback in messengers that truncate URLs.",
    );
  if (hash.length > 120_000)
    warnings.push(
      "This share payload is very large. Copy the capsule or source script as a fallback.",
    );
  return {
    hash,
    url,
    capsule,
    encoding,
    bytes: payload.length,
    chars: url.length,
    digest,
    portable,
    urlSafe,
    warnings,
    sourceFormat: "compiled-json.v2",
  };
}

export async function decodeSessionHash(hash = location.hash) {
  return decodeSessionFromString(hash);
}

export async function decodeSessionFromString(input: string) {
  const source = await decodeSourceFromString(input).catch((e) => {
    throw e;
  });
  if (source) return source;
  return decodeCompiledSessionFromString(input);
}

export async function decodeSourceFromString(input: string) {
  const text = String(input || "").trim();
  if (!text) return null;
  const hash = text.includes("#") ? text.slice(text.indexOf("#")) : text;

  const capsule = text.match(
    /ENTRAIN-SOURCE:v1:(entrain|sbagen):(raw|gzip):([0-9a-f]{12}):([A-Za-z0-9_-]+)/,
  );
  if (capsule)
    return decodeSourceV1(
      capsule[1] as "entrain" | "sbagen",
      capsule[2] as "raw" | "gzip",
      capsule[3],
      capsule[4],
    );

  const v1 = hash.match(
    /(?:^#|&)src=v1\.(entrain|sbagen)\.(raw|gzip)\.([0-9a-f]{12})\.([^&]+)/,
  );
  if (v1)
    return decodeSourceV1(
      v1[1] as "entrain" | "sbagen",
      v1[2] as "raw" | "gzip",
      v1[3],
      v1[4],
    );

  // Plain pasted source text fallback.
  if (looksLikeSbagen(text)) return sbagenTextToSession(text).session;
  if (
    /^(name|duration|loop|binaural|monaural|iso-|noise|ambience|carrier|additive|karplus)\b/im.test(
      text,
    )
  )
    return patternTextToSession(text);
  return null;
}

async function decodeSourceV1(
  format: "entrain" | "sbagen",
  mode: "raw" | "gzip",
  expectedDigest: string,
  payload: string,
) {
  const bytes = fromBase64url(payload);
  const decoded = mode === "gzip" ? await gunzip(bytes) : bytes;
  const actual = await shortDigest(decoded);
  if (expectedDigest && actual !== expectedDigest)
    throw new Error(
      `Shared ENTRAIN source failed checksum: expected ${expectedDigest}, got ${actual}.`,
    );
  const script = new TextDecoder().decode(decoded);
  return format === "sbagen"
    ? sbagenTextToSession(script).session
    : patternTextToSession(script);
}

async function decodeCompiledSessionFromString(input: string) {
  const text = String(input || "").trim();
  if (!text) return null;

  const hash = text.includes("#") ? text.slice(text.indexOf("#")) : text;
  const capsule = text.match(
    /ENTRAIN:v2:(raw|gzip):([0-9a-f]{12}):([A-Za-z0-9_-]+)/,
  );
  if (capsule)
    return decodeV2(capsule[1] as "raw" | "gzip", capsule[2], capsule[3]);

  const v2 = hash.match(/(?:^#|&)es=v2\.(raw|gzip)\.([0-9a-f]{12})\.([^&]+)/);
  if (v2) return decodeV2(v2[1] as "raw" | "gzip", v2[2], v2[3]);

  const v1 = hash.match(/(?:^#|&)es=v1\.(raw|gzip)\.([^&]+)/);
  if (v1) {
    const mode = v1[1] as "raw" | "gzip";
    const bytes = fromBase64url(v1[2]);
    const decoded = mode === "gzip" ? await gunzip(bytes) : bytes;
    return sanitizeSession(JSON.parse(new TextDecoder().decode(decoded)));
  }

  // Legacy v0.17 share URLs: #s=<maybe-gzip-or-raw>. Keep readable.
  const legacy = hash.match(/(?:^#|&)s=([^&]+)/);
  if (legacy) {
    const bytes = fromBase64url(legacy[1]);
    const maybe = await gunzip(bytes).catch(() => bytes);
    return sanitizeSession(JSON.parse(new TextDecoder().decode(maybe)));
  }

  // Raw JSON paste fallback.
  if (text.startsWith("{")) return sanitizeSession(JSON.parse(text));
  return null;
}

async function decodeV2(
  mode: "raw" | "gzip",
  expectedDigest: string,
  payload: string,
) {
  const bytes = fromBase64url(payload);
  const decoded = mode === "gzip" ? await gunzip(bytes) : bytes;
  const actual = await shortDigest(decoded);
  if (expectedDigest && actual !== expectedDigest)
    throw new Error(
      `Shared ENTRAIN capsule failed checksum: expected ${expectedDigest}, got ${actual}.`,
    );
  return sanitizeSession(JSON.parse(new TextDecoder().decode(decoded)));
}

export function canonicalJson(value: unknown) {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: any): any {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const key of Object.keys(value).sort()) {
      const v = value[key];
      if (v !== undefined) out[key] = canonicalize(v);
    }
    return out;
  }
  return value;
}

async function shortDigest(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .slice(0, 6)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function gzip(bytes: Uint8Array) {
  if (!("CompressionStream" in window)) return null;
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

async function gunzip(bytes: Uint8Array) {
  if (!("DecompressionStream" in window))
    throw new Error(
      "This browser cannot decompress shared ENTRAIN URLs. Ask the sender to copy the source capsule, export source script, or open in a modern browser.",
    );
  const ds = new DecompressionStream("gzip");
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

function base64url(bytes: Uint8Array) {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk)
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function fromBase64url(s: string) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  s += "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
