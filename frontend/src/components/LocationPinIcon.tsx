type LocationPinIconProps = {
  className?: string;
};

export default function LocationPinIcon({ className }: LocationPinIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 21s6-5.02 6-10a6 6 0 1 0-12 0c0 4.98 6 10 6 10Z" />
      <circle cx="12" cy="11" r="2.5" />
    </svg>
  );
}
