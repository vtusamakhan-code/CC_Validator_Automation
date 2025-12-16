export function luhn_checksum(code: string): number {
  const len = code.length;
  const parity = len % 2;
  let sum = 0;
  for (let i = len - 1; i >= 0; i--) {
    let d = parseInt(code.charAt(i));
    if (i % 2 === parity) {
      d *= 2;
    }
    if (d > 9) {
      d -= 9;
    }
    sum += d;
  }
  return sum % 10;
}

export function luhn_validate(fullcode: string): boolean {
  return luhn_checksum(fullcode) === 0;
}
