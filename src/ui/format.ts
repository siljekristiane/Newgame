/** 123456.7 m → "123,46 km" (Norwegian decimal comma). */
export const km = (meters: number, digits = 2): string =>
  (meters / 1000).toLocaleString('nb-NO', { minimumFractionDigits: digits, maximumFractionDigits: digits }) + ' km';

export const meters = (m: number): string => Math.round(m).toLocaleString('nb-NO') + ' m';

const COMPASS = ['N', 'NØ', 'Ø', 'SØ', 'S', 'SV', 'V', 'NV'];
/** Heading (radians, atan2(dx, dz)) → compass point. North is -Z. */
export function compass(heading: number): string {
  const deg = (((180 - (heading * 180) / Math.PI) % 360) + 360) % 360;
  return COMPASS[Math.round(deg / 45) % 8]!;
}
