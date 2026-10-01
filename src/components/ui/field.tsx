import type { InputHTMLAttributes } from 'react';

/**
 * Form field.
 *
 * Label, hint, and error are wired together with ids so the error is announced
 * as part of the control, not just printed underneath it. The border colour
 * change is never the only signal — the message text and aria-invalid carry it
 * too.
 */
export function Field({
  label,
  name,
  hint,
  error,
  required = false,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  name: string;
  hint?: string;
  error?: string;
}) {
  const id = `field-${name}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div>
      <label htmlFor={id} className="block text-[13px] font-medium text-ink">
        {label}
        {required ? (
          <>
            <span aria-hidden="true" className="ml-0.5 text-danger">
              *
            </span>
            <span className="focusable-sr-only"> (required)</span>
          </>
        ) : (
          <span className="ml-1 font-normal text-ink-muted">(optional)</span>
        )}
      </label>

      {hint ? (
        <p id={hintId} className="mt-1 text-[13px] text-ink-muted">
          {hint}
        </p>
      ) : null}

      <input
        id={id}
        name={name}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`mt-1.5 h-10 w-full rounded-xs border bg-surface px-3 text-sm text-ink transition-colors placeholder:text-ink-muted ${
          error ? 'border-danger' : 'border-line-strong hover:border-ink-muted'
        }`}
        {...rest}
      />

      {error ? (
        <p id={errorId} className="mt-1.5 text-[13px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
