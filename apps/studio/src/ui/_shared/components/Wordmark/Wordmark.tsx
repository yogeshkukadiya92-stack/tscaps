import type { MouseEventHandler } from 'react';

interface WordmarkProps {
  /** When set, the wordmark renders as a link. Use `/` to point home. */
  readonly href?: string;
  /** Bypasses the link nav (e.g., to use react-router-dom programmatically). */
  readonly onClick?: MouseEventHandler<HTMLAnchorElement>;
  /** `sm` for compact bars, `md` (default) for shells, `lg` for splash / hero. */
  readonly size?: 'sm' | 'md' | 'lg';
  /** Drives the dot blink — the app's "I'm working" signature. */
  readonly working?: boolean;
  readonly className?: string;
}

const SIZE_CLASS: Record<NonNullable<WordmarkProps['size']>, string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-2xl',
};

const BASE =
  'inline-flex items-center font-sans font-semibold tracking-[-0.04em] select-none';

/** Shared ReelStudio brand mark, with a blinking activity indicator. */
export function Wordmark({ href, onClick, size = 'md', working = false, className = '' }: WordmarkProps) {
  const sizeClass = SIZE_CLASS[size];
  const isLink = href !== undefined;
  const isStage = size === 'lg';

  const hoverShift = isLink
    ? ' group-hover:text-accent-hover group-focus-visible:text-accent-hover'
    : '';

  const capsClass = `${isStage ? 'animate-caption-paint' : 'text-accent'} transition-colors duration-quick ease-standard${hoverShift}`;
  const dotClass = `text-accent ml-px transition-colors duration-quick ease-standard${hoverShift}${working ? ' animate-dot-blink' : ''}`;

  const content = (
    <>
      <img src="/reelstudio-logo.svg" alt="" aria-hidden="true" className="mr-2 h-[1.6em] w-[1.6em] shrink-0" />
      <span className="text-fg-primary">Reel</span>
      <span className={capsClass}>Studio</span>
      <span className={dotClass} aria-hidden="true">.</span>
    </>
  );

  if (isLink) {
    return (
      <a
        href={href}
        onClick={onClick}
        className={`${BASE} group ${sizeClass} focus-visible:outline-none ${className}`}
        aria-label="ReelStudio — home"
      >
        {content}
      </a>
    );
  }

  return (
    <span className={`${BASE} ${sizeClass} ${className}`} aria-label="ReelStudio">
      {content}
    </span>
  );
}
