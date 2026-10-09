/** Small inline icons the Cloudscape set does not include. */

export function QuestionIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M6 6.2a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6.9v.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="8" cy="11.6" r="1" fill="currentColor" />
    </svg>
  );
}

/** Amazon Q style mark: a hexagon with a rounded "Q" tail on a purple gradient tile. */
export function QLogo({ size = 24, tile = true }: { size?: number; tile?: boolean }) {
  const id = `qg${size}${tile ? "t" : ""}`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5c33ff" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      {tile && <rect x="0" y="0" width="32" height="32" rx="7" fill={`url(#${id})`} />}
      <path
        d="M16 6.5l8.2 4.75v9.5L16 25.5l-8.2-4.75v-9.5z"
        fill="none"
        stroke={tile ? "#ffffff" : `url(#${id})`}
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <path d="M16 16l4.2 2.4" stroke={tile ? "#ffffff" : `url(#${id})`} strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="16" cy="16" r="1.7" fill={tile ? "#ffffff" : "#7c3aed"} />
    </svg>
  );
}
