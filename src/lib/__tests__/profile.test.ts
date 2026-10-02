import { afterEach, describe, expect, it } from 'vitest';
import { profileSchema } from '@/lib/validation';
import { isPublicOrigin, publicOrigin } from '@/lib/env';

const original = process.env.NEXT_PUBLIC_SITE_URL;

afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = original;
});

describe('profileSchema', () => {
  it('accepts an ordinary name', () => {
    const result = profileSchema.safeParse({ fullName: 'Alice Adams' });
    expect(result.success).toBe(true);
  });

  it('trims surrounding whitespace', () => {
    const result = profileSchema.safeParse({ fullName: '  Alice Adams  ' });
    expect(result.success && result.data.fullName).toBe('Alice Adams');
  });

  it('rejects an empty name', () => {
    expect(profileSchema.safeParse({ fullName: '' }).success).toBe(false);
  });

  it('rejects a name that is only whitespace', () => {
    // Trimming happens before the length check, so this is empty, not length 3.
    expect(profileSchema.safeParse({ fullName: '   ' }).success).toBe(false);
  });

  it('rejects a single character', () => {
    expect(profileSchema.safeParse({ fullName: 'A' }).success).toBe(false);
  });

  it('rejects a name over the column length', () => {
    expect(profileSchema.safeParse({ fullName: 'a'.repeat(121) }).success).toBe(false);
  });

  it('accepts a name at the boundary', () => {
    expect(profileSchema.safeParse({ fullName: 'a'.repeat(120) }).success).toBe(true);
  });

  it('rejects a missing name', () => {
    expect(profileSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a non-string name', () => {
    // FormData can only carry strings, but the schema is the trust boundary and
    // should not depend on that holding for every future caller.
    expect(profileSchema.safeParse({ fullName: 42 }).success).toBe(false);
    expect(profileSchema.safeParse({ fullName: null }).success).toBe(false);
  });

  it('ignores an attempt to carry an id or email alongside the name', () => {
    // Not merely rejected: stripped, so a form change cannot widen what a user
    // is able to change about their own record.
    const result = profileSchema.safeParse({
      fullName: 'Alice Adams',
      id: '22222222-2222-2222-2222-222222222222',
      email: 'hacker@evil.com',
    });
    expect(result.success && result.data).toEqual({ fullName: 'Alice Adams' });
  });
});

describe('isPublicOrigin', () => {
  it('accepts absolute https and http origins', () => {
    expect(isPublicOrigin('https://buysell-sigma.vercel.app')).toBe(true);
    expect(isPublicOrigin('http://localhost:3000')).toBe(true);
  });

  it('rejects an empty or missing value', () => {
    expect(isPublicOrigin('')).toBe(false);
    expect(isPublicOrigin(undefined)).toBe(false);
    expect(isPublicOrigin(null)).toBe(false);
  });

  it('rejects a relative path, which Supabase would resolve against its own site URL', () => {
    expect(isPublicOrigin('/auth/callback')).toBe(false);
    expect(isPublicOrigin('buysell-sigma.vercel.app')).toBe(false);
  });

  it('rejects a scheme that is not http(s)', () => {
    expect(isPublicOrigin('javascript:alert(1)')).toBe(false);
    expect(isPublicOrigin('data:text/html,x')).toBe(false);
  });
});

describe('publicOrigin', () => {
  it('returns the configured origin without a trailing slash', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://buysell-sigma.vercel.app/';
    expect(publicOrigin()).toBe('https://buysell-sigma.vercel.app');
  });

  it('trims surrounding whitespace from a quoted env value', () => {
    process.env.NEXT_PUBLIC_SITE_URL = '  https://buysell-sigma.vercel.app  ';
    expect(publicOrigin()).toBe('https://buysell-sigma.vercel.app');
  });

  it('returns null when unset, so sign-in fails closed rather than guessing', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(publicOrigin()).toBeNull();
  });

  it('returns null for a malformed value', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'not a url';
    expect(publicOrigin()).toBeNull();
  });
});
