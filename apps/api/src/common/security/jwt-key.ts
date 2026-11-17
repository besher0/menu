export function signingKey(value: string | undefined): string {
  if (!value || value.trim() !== value || Buffer.byteLength(value, "utf8") < 32 ||
      /^(?:change[-_ ]?me|replace[-_ ]?me|example|placeholder)/i.test(value) || new Set(value).size < 5 || /^(.{1,16})\1+$/.test(value)) {
    throw new Error("JWT_SECRET must be a separately generated signing key of at least 32 bytes");
  }
  return value;
}
