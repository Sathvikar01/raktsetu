export interface SpinnerProps {
  label: string;
  className?: string;
}

export function Spinner({ label, className = "size-5" }: SpinnerProps) {
  return (
    <span role="status" className="inline-flex items-center gap-2">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden className={`${className} animate-spin`}>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}
