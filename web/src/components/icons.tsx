import type { ReactNode } from "react";

/** `weight` is the stroke width in the 24-unit box: heavier for a small mark that must read. */
type IconProps = { size?: number; className?: string; weight?: number };

/**
 * Inline stroke icons (§10): decorative, so hidden from screen readers; the control around them
 * carries the label. They draw in the current text colour.
 */
function Stroke({
  size = 20,
  className,
  weight = 2,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={weight}
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

/** Ends practice; Didn't know; removes a photo. */
export const CloseIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Stroke>
);

/** Knew it; Add; a photo read; Done. */
export const CheckIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Stroke>
);

/** Skip a card. */
export const ArrowUpIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Stroke>
);

/** "Tap to flip" on the card's front. */
export const RotateIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5" />
  </Stroke>
);

/** Taking photos: Import's drop zone, the Last import source. */
export const CameraIcon = (props: IconProps) => (
  <Stroke weight={1.8} {...props}>
    <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.8l1.4-2h4.6l1.4 2h1.8A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
    <circle cx="12" cy="12.5" r="3.5" />
  </Stroke>
);

/** The Last 7 days source. */
export const CalendarIcon = (props: IconProps) => (
  <Stroke weight={1.8} {...props}>
    <rect x="4" y="5" width="16" height="15" rx="3" />
    <path d="M4 10h16M9 3v4M15 3v4" />
  </Stroke>
);

/** The Not learned yet source. */
export const TargetIcon = (props: IconProps) => (
  <Stroke weight={1.8} {...props}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="12" cy="12" r="0.6" fill="currentColor" />
  </Stroke>
);

/** The AI and the dictionary disagree on an article (Review). */
export const WarningIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M12 4 2.5 20h19z" />
    <path d="M12 10v4M12 17h.01" />
  </Stroke>
);

/** Details ready (Done). */
export const SparkleIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
  </Stroke>
);

/** Delete word. */
export const TrashIcon = (props: IconProps) => (
  <Stroke weight={1.9} {...props}>
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6.5 7l.8 11.2A2 2 0 0 0 9.3 20h5.4a2 2 0 0 0 2-1.8L17.5 7M10 11v5M14 11v5" />
  </Stroke>
);
