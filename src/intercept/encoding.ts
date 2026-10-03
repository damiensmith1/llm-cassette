import { brotliDecompressSync, gunzipSync, inflateSync, zstdDecompressSync } from "node:zlib";

const DECODERS: Record<string, (buf: Buffer) => Buffer> = {
  gzip: gunzipSync,
  "x-gzip": gunzipSync,
  deflate: inflateSync,
  br: brotliDecompressSync,
  zstd: zstdDecompressSync,
};

/**
 * Socket-level interception sees the raw bytes off the wire, still compressed.
 * (`fetch` decodes for the app, so the SDK never notices.) Decode before
 * recording; an unknown encoding is left as-is.
 */
export async function decodeBody(res: Response): Promise<Response> {
  const encodings = (res.headers.get("content-encoding") ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e && e !== "identity");
  if (encodings.length === 0 || !encodings.every((e) => e in DECODERS)) return res;

  // Encodings are listed in the order applied, so undo them in reverse.
  let body: Buffer = Buffer.from(await res.clone().arrayBuffer());
  for (const e of [...encodings].reverse()) body = DECODERS[e]!(body);

  const headers = new Headers(res.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  return new Response(new Uint8Array(body), { status: res.status, headers });
}
