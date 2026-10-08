export function iso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

export function now(): Date {
  return new Date();
}

export function asNumber(value: string | number | bigint): number {
  return typeof value === "number" ? value : Number(value);
}
