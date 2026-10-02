import type { ReactNode } from 'react';
import Link from 'next/link';

/**
 * Shared layout primitives. Layout lives here rather than being re-specified per
 * page so spacing, measure, and heading rhythm stay consistent.
 */

/** Page shell: one measure, consistent gutters, responsive to 375px. */
export function Container({
  children,
  className = '',
  size = 'default',
}: {
  children: ReactNode;
  className?: string;
  size?: 'default' | 'narrow' | 'wide';
}) {
  const width =
    size === 'narrow' ? 'max-w-2xl' : size === 'wide' ? 'max-w-7xl' : 'max-w-5xl';
  return (
    <div className={`mx-auto w-full ${width} px-5 sm:px-6 lg:px-8 ${className}`}>
      {children}
    </div>
  );
}

/**
 * Section heading. The eyebrow/small caps label is the device that creates
 * hierarchy without adding decoration.
 */
export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  live = false,
  as: Tag = 'h2',
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  /** Announce description changes, for counts that change under the user. */
  live?: boolean;
  as?: 'h1' | 'h2' | 'h3';
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-prose">
        {eyebrow ? (
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
            {eyebrow}
          </p>
        ) : null}
        <Tag className="text-2xl font-semibold sm:text-[28px]">{title}</Tag>
        {description ? (
          <p
            className="mt-3 text-[15px] leading-relaxed text-ink-soft"
            {...(live ? { role: 'status', 'aria-live': 'polite' } : {})}
          >
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/** Page title block for interior pages. */
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="border-b border-line pb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {eyebrow ? (
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="text-3xl font-semibold sm:text-4xl">{title}</h1>
          {description ? (
            <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-ink-soft">
              {description}
            </p>
          ) : null}
        </div>
        {action}
      </div>
    </header>
  );
}

/** Small labelled value, used in order summaries. */
export function DataRow({
  label,
  value,
  emphasis = false,
}: {
  label: ReactNode;
  value: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className={emphasis ? 'text-sm font-semibold text-ink' : 'text-sm text-ink-soft'}>
        {label}
      </dt>
      <dd
        className={
          emphasis
            ? 'text-base font-semibold tabular-nums text-ink'
            : 'text-sm tabular-nums text-ink'
        }
      >
        {value}
      </dd>
    </div>
  );
}

/** Inline banner. `role="status"` so it is announced without stealing focus. */
export function Notice({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success';
  title?: string;
  children: ReactNode;
}) {
  const tones = {
    info: 'border-line bg-surface text-ink-soft',
    warning: 'border-accent-soft bg-accent-soft text-accent-ink',
    danger: 'border-danger-soft bg-danger-soft text-danger',
    success: 'border-success/30 bg-success-soft text-success',
  } as const;

  return (
    <div
      className={`rounded-xs border px-4 py-3 text-sm leading-relaxed ${tones[tone]}`}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      {title ? <p className="mb-1 font-semibold">{title}</p> : null}
      <div className={title ? 'text-[13px]' : undefined}>{children}</div>
    </div>
  );
}

/** Text link styled consistently, used where a button would be wrong. */
export function TextLink({
  href,
  children,
  className = '',
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`text-sm text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-ink ${className}`}
    >
      {children}
    </Link>
  );
}
