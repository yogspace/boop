/** 16 bytes written as a UUID: 8-4-4-4-12 hex digits. */
const uuidOf = (bytes: Uint8Array) => {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10).join(""),
  ].join("-");
};

/**
 * A new random id (UUID v4) – made where the thing is made, also offline, so
 * a stamp drawn without a connection already has the id it keeps on the
 * server.
 *
 * `crypto.randomUUID` only exists in secure contexts (https, localhost); a
 * phone opening the dev server over the LAN builds it from random bytes.
 */
export const newId = (): string => {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return uuidOf(bytes);
};

/** Ids the app accepts from a device: UUID-shaped, nothing else. */
export const isId = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

// ── Made of names ───────────────────────────────────────────────────────────

const rotl = (x: number, n: number) => (x << n) | (x >>> (32 - n));

/** SHA-1 – for `nameId` alone: nothing secret goes in, it only mixes. */
const sha1 = (data: Uint8Array): Uint8Array => {
  const words = new Uint32Array((((data.length + 8) >> 6) + 1) * 16);
  for (let i = 0; i < data.length; i++) {
    words[i >> 2] |= data[i] << (24 - (i % 4) * 8);
  }
  words[data.length >> 2] |= 0x80 << (24 - (data.length % 4) * 8);
  // The length in bits – the names here are far too short for the high word.
  words[words.length - 1] = data.length * 8;
  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const w = new Uint32Array(80);
  for (let block = 0; block < words.length; block += 16) {
    for (let i = 0; i < 16; i++) w[i] = words[block + i];
    for (let i = 16; i < 80; i++) {
      w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    }
    let [a, b, c, d, e] = h;
    for (let i = 0; i < 80; i++) {
      const [f, k] =
        i < 20
          ? [(b & c) | (~b & d), 0x5a827999]
          : i < 40
            ? [b ^ c ^ d, 0x6ed9eba1]
            : i < 60
              ? [(b & c) | (b & d) | (c & d), 0x8f1bbcdc]
              : [b ^ c ^ d, 0xca62c1d6];
      const t = (rotl(a, 5) + f + e + k + w[i]) >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30) >>> 0;
      b = a;
      a = t;
    }
    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
  }
  const out = new Uint8Array(20);
  for (const [i, v] of h.entries()) {
    out[i * 4] = v >>> 24;
    out[i * 4 + 1] = (v >>> 16) & 255;
    out[i * 4 + 2] = (v >>> 8) & 255;
    out[i * 4 + 3] = v & 255;
  }
  return out;
};

/** A UUID's 16 bytes. */
const uuidBytes = (id: string) =>
  Uint8Array.from(id.replace(/-/g, "").match(/../g) ?? [], (pair) =>
    Number.parseInt(pair, 16)
  );

/**
 * An id made of names – the same wherever it is made: a name-based UUID
 * (version 5, RFC 9562) of `name`, in `space` as its namespace. For what
 * there is one of, and only one, so two devices that start it offline still
 * start the same: a day's note (calendar/note.ts), one's own settings for a
 * calendar (calendar/prefs.ts).
 */
export const nameId = (space: string, name: string): string => {
  const encoder = new TextEncoder();
  // A namespace is a UUID (a calendar's id) – anything else, as its text.
  const prefix = isId(space) ? uuidBytes(space) : encoder.encode(space);
  const text = encoder.encode(name);
  const data = new Uint8Array(prefix.length + text.length);
  data.set(prefix);
  data.set(text, prefix.length);
  const bytes = sha1(data).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return uuidOf(bytes);
};
