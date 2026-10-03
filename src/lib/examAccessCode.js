export const ACCESS_CODE_LENGTHS = [5, 6, 7, 8, 9, 10];

export function generateAccessCode(length = 8) {
  if (!ACCESS_CODE_LENGTHS.includes(length)) throw new Error('اختر رمزاً من 5 إلى 10 أرقام.');

  let code = '';
  while (code.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    for (const byte of bytes) {
      if (byte >= 250) continue;
      code += String(byte % 10);
      if (code.length === length) break;
    }
  }
  return code;
}
