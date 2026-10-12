export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().normalize('NFKC').toLowerCase();
  if (
    email.length < 6 ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ||
    /[\u0000-\u001f\u007f]/.test(email)
  )
    return null;
  return email;
}

export function normalizeDisplayName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.normalize('NFC').trim();
  const length = [...name].length;
  if (!length || length > 32 || /[\u0000-\u001f\u007f]/.test(name)) return null;
  return name;
}

export function validPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 10 && value.length <= 128;
}
