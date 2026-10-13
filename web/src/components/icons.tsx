import type { ReactNode } from "react";

type IconProps = { size?: number; className?: string };

/**
 * Inline stroke icons (§10): decorative, so hidden from screen readers; the control around them
 * carries the label. They draw in the current text colour.
 */
function Stroke({ size = 20, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const ChevronLeftIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M15 6l-6 6 6 6" />
  </Stroke>
);

export const ChevronRightIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M9 6l6 6-6 6" />
  </Stroke>
);

export const ChevronDownIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="m6 9 6 6 6-6" />
  </Stroke>
);

export const PencilIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
    <path d="m13.5 6.5 4 4" />
  </Stroke>
);

export const PlusIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M12 5v14M5 12h14" />
  </Stroke>
);

export const ArrowUpRightIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M7 17 17 7M9 7h8v8" />
  </Stroke>
);

export const SearchIcon = (props: IconProps) => (
  <Stroke {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Stroke>
);

/** A closed book; `lines` adds the text lines on its cover (Home's My words tile). */
export const BookIcon = ({ lines = false, ...props }: IconProps & { lines?: boolean }) => (
  <Stroke {...props}>
    <g strokeWidth={1.8}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H19v14H5.5A1.5 1.5 0 0 0 4 19.5z" />
      <path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H19v-3" />
      {lines && <path d="M8 8h7M8 11.5h5" />}
    </g>
  </Stroke>
);

/** The filled triangle in Practice's circle. */
export const PlayIcon = ({ size = 24, className }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5z" />
  </svg>
);
