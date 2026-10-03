/**
 * The BuySell design tokens, copied from the website's globals.css.
 *
 * The app and the site are one product, so they use one palette: warm stone
 * surfaces, one gold accent used sparingly, hairline borders and near-square
 * corners. React Native has no CSS custom properties, so these are plain
 * constants -- the values here are the source of truth for mobile, and they are
 * meant to be edited in step with src/app/globals.css.
 */
export const theme = {
  canvas: '#fafaf9',
  surface: '#ffffff',
  ink: '#1c1917',
  onInk: '#ffffff',
  inkSoft: '#44403c',
  inkMuted: '#78716c',
  line: '#e7e5e4',
  lineStrong: '#d6d3d1',
  accent: '#a16207',
  accentSoft: '#fef3c7',
  danger: '#b91c1c',
  dangerSoft: '#fef2f2',
  success: '#15803d',
} as const;

/** Near-square corners, per the site's Swiss styling. */
export const radius = 2;

/** Motion is 200-250ms on the web; keep native transitions in the same band. */
export const duration = 200;
