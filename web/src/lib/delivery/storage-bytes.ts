/** Supabase Storage upload must receive Uint8Array/ArrayBuffer, not Node Buffer (UTF-8 corruption). */
export function toStorageUploadBody(data: Buffer | Uint8Array | ArrayBuffer): Uint8Array {
  if (data instanceof Uint8Array && !(data instanceof Buffer)) {
    return data;
  }
  if (data instanceof Buffer) {
    return Uint8Array.from(data);
  }
  return new Uint8Array(data);
}
