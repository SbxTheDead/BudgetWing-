/** Shared line icons — 1.5px strokes, sized by the parent's font-size or props. */

type IconProps = { className?: string; size?: number };

function base(size: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

export function PlaneIcon({ className, size = 16 }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden>
      <path d="M21 12 3.5 19l3-7-3-7L21 12Z" />
      <path d="M6.5 12H21" opacity="0.45" />
    </svg>
  );
}

export function BagIcon({ className, size = 16 }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden>
      <rect x="4" y="7" width="16" height="14" rx="2.5" />
      <path d="M9 7V4.8A1.8 1.8 0 0 1 10.8 3h2.4A1.8 1.8 0 0 1 15 4.8V7" />
      <path d="M9 21v1M15 21v1" opacity="0.5" />
    </svg>
  );
}

export function ClockIcon({ className, size = 16 }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function BoltIcon({ className, size = 16 }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden>
      <path d="M13.5 3 5 14h5l-1 7 8.5-11h-5l1-7Z" />
    </svg>
  );
}

export function WalletIcon({ className, size = 16 }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden>
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10h18" opacity="0.5" />
      <circle cx="16.5" cy="14.5" r="1.2" />
    </svg>
  );
}

export function CompassIcon({ className, size = 16 }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.2 8.8l-2 4.4-4.4 2 2-4.4 4.4-2Z" />
    </svg>
  );
}

export function ArrowIcon({ className, size = 16 }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden>
      <path d="M4 12h15" />
      <path d="M13.5 6.5 20 12l-6.5 5.5" />
    </svg>
  );
}

export function SendIcon({ className, size = 16 }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden>
      <path d="M4 11.5 20.5 4l-7 16.5-2.6-6.4L4 11.5Z" />
    </svg>
  );
}

export function CheckIcon({ className, size = 16 }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden>
      <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
    </svg>
  );
}

export function RefreshIcon({ className, size = 16 }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4v4h-4" />
    </svg>
  );
}

export function LayersIcon({ className, size = 16 }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden>
      <path d="M12 3 3 7.5l9 4.5 9-4.5L12 3Z" />
      <path d="M3 12.5 12 17l9-4.5" opacity="0.55" />
    </svg>
  );
}
