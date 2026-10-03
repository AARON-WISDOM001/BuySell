import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Design-token guardrail.
 *
 * Dark mode inverts --color-ink to near-white. A hardcoded text-white on an
 * ink surface is therefore correct only in light mode, where it happens to be
 * the default — so the bug is invisible until someone toggles the theme. It
 * measured 1.09:1 before --color-on-ink existed, across thirteen sites that
 * each looked correct in isolation.
 *
 * A lint rule would be the natural home for this, but it would need a plugin
 * and a config for a single check. A test runs in `npm run verify` already,
 * costs no dependency, and fails the build the same way.
 */

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsxFiles(full));
    else if (entry.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/** Every className string literal in a file. */
function classStrings(source: string): string[] {
  return [...source.matchAll(/className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{'([^']*)'\})/g)].map(
    (m) => m[1] ?? m[2] ?? m[3] ?? m[4] ?? '',
  );
}

/** Whole-token match, so bg-ink-soft and hover:bg-ink do not count. */
const INK_SURFACE = /(?:^|\s)bg-ink(?:\s|$)/;
const ON_INK = /(?:^|\s)text-on-ink(?:\s|$)/;

describe('ink surfaces', () => {
  it('every bg-ink surface declares text-on-ink', () => {
    const offenders: string[] = [];

    for (const file of tsxFiles(join(ROOT, 'src'))) {
      const source = readFileSync(file, 'utf8');
      source.split('\n').forEach((line, i) => {
        for (const className of classStrings(line)) {
          if (INK_SURFACE.test(className) && !ON_INK.test(className)) {
            offenders.push(
              `${file.slice(ROOT.length)}:${i + 1}  ${className.trim().slice(0, 70)}`,
            );
          }
        }
      });
    }

    expect(offenders, `bg-ink without text-on-ink:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('defines --color-on-ink for both themes', () => {
    const css = readFileSync(join(ROOT, 'src/app/globals.css'), 'utf8');
    const declarations = [...css.matchAll(/--color-on-ink:\s*(#[0-9a-f]{3,8})/gi)].map((m) =>
      m[1].toLowerCase(),
    );
    // One in @theme, one in the .dark override. Fewer means one theme has no
    // defined value and falls back to the other's, which is the original bug.
    expect(declarations.length).toBe(2);
    expect(new Set(declarations).size).toBe(2);
  });

  it('no hardcoded text-white survives in components', () => {
    const offenders: string[] = [];
    for (const file of tsxFiles(join(ROOT, 'src'))) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/(?:^|\s)text-white(?:\s|$)/.test(line)) {
            offenders.push(`${file.slice(ROOT.length)}:${i + 1}`);
          }
        });
    }
    expect(offenders, `text-white is not theme-aware:\n${offenders.join('\n')}`).toEqual([]);
  });
});
