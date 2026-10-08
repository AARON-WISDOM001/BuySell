/**
 * The BuySell design tokens, copied from the website's globals.css.
 *
 * The app and the site are one product, so they use one palette: warm stone
 * surfaces, one gold accent used sparingly, hairline borders and near-square
 * corners. React Native has no CSS custom properties, so these are plain
 * constants -- the values here are the source of truth for mobile, and they are
 * meant to be edited in step with src/app/globals.css.
 */
import 'expo-sqlite/localStorage/install';
import { createContext, createElement, useContext, useState, type ReactNode } from 'react';

export const lightTheme = {
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
  accentInk: '#78350f',
  danger: '#b91c1c',
  dangerSoft: '#fef2f2',
  success: '#15803d',
} as const;

export const darkTheme = {
  canvas: '#171613',
  surface: '#211f1b',
  ink: '#f5f5f4',
  onInk: '#171613',
  inkSoft: '#d6d3d1',
  inkMuted: '#a8a29e',
  line: '#3d3933',
  lineStrong: '#57534e',
  accent: '#fbbf24',
  accentSoft: '#422006',
  accentInk: '#fbbf24',
  danger: '#fca5a5',
  dangerSoft: '#450a0a',
  success: '#86efac',
} as const;

export type Theme = { [Key in keyof typeof lightTheme]: string };
type ThemeContextValue = { theme: Theme; isDark: boolean; toggleTheme: () => void };
const THEME_STORAGE_KEY = 'buysell-theme';
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(() => {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY) === 'dark';
    } catch {
      return false;
    }
  });

  function toggleTheme() {
    setIsDark((current) => {
      const next = !current;
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next ? 'dark' : 'light');
      } catch {
        // Keep the selected theme for this session when storage is unavailable.
      }
      return next;
    });
  }

  return createElement(
    ThemeContext.Provider,
    { value: { theme: isDark ? darkTheme : lightTheme, isDark, toggleTheme } },
    children,
  );
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used within ThemeProvider');
  return value;
}

/** Near-square corners, per the site's Swiss styling. */
export const radius = 2;

/** Larger steps, matching --radius-sm/--radius-md on the website. */
export const radiusSm = 3;
export const radiusMd = 5;

/** Motion is 200-250ms on the web; keep native transitions in the same band. */
export const duration = 200;
