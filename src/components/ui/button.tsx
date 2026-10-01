import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * Button styles.
 *
 * One file so the whole app shares three button shapes instead of drifting into
 * twelve. `focus-visible` rings come from globals.css, so nothing here has to
 * think about focus.
 */

const base =
  'inline-flex items-center justify-center gap-2 rounded-xs font-medium ' +
  'transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] ' +
  'disabled:pointer-events-none disabled:opacity-45 select-none';

const variants = {
  /** Primary call to action. Solid ink. */
  primary: `${base} bg-ink text-white hover:bg-ink-soft`,
  /** Secondary action. Outline, no fill. */
  secondary: `${base} border border-line-strong bg-surface text-ink hover:bg-canvas`,
  /** Tertiary: text that reads as a link but is a real button. */
  ghost: `${base} text-ink-soft hover:text-ink hover:bg-canvas`,
  /** Destructive, for remove actions. */
  danger: `${base} text-danger hover:bg-danger-soft`,
} as const;

const sizes = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-10 px-5 text-sm',
  lg: 'h-12 px-7 text-[15px]',
  icon: 'h-9 w-9 text-sm',
} as const;

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  children: ReactNode;
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button type={type} className={`${variants[variant]} ${sizes[size]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export { variants as buttonVariants, sizes as buttonSizes };
