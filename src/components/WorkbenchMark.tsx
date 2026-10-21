import type { CSSProperties } from 'react';

/**
 * The OpenBOR Workbench mark: a pixel sprite standing on a bench with its body box drawn
 * around it and two tools hanging on the wall behind.
 */
export function WorkbenchMark({
  size = 38,
  className,
  style,
}: {
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={className}
      style={style}
      role="img"
      aria-label="OpenBOR Workbench"
    >
      <rect width="48" height="48" rx="11" fill="#0c0f14" />
      {/* Pegboard wall behind the bench */}
      <g fill="#262c37">
        <circle cx="9" cy="10" r="0.9" />
        <circle cx="17" cy="10" r="0.9" />
        <circle cx="25" cy="10" r="0.9" />
        <circle cx="33" cy="10" r="0.9" />
        <circle cx="39" cy="10" r="0.9" />
        <circle cx="9" cy="16" r="0.9" />
        <circle cx="39" cy="16" r="0.9" />
        <circle cx="9" cy="22" r="0.9" />
        <circle cx="39" cy="22" r="0.9" />
      </g>
      {/* Hammer on the left of the wall */}
      <g transform="rotate(-22 13 15)">
        <rect x="12.4" y="13" width="1.8" height="12" rx="0.9" fill="#c9853f" />
        <rect x="10" y="9.5" width="6.5" height="3.6" rx="1.2" fill="#8a929f" />
      </g>
      {/* Wrench on the right of the wall */}
      <g transform="rotate(20 35 15)">
        <rect x="34.2" y="13" width="1.8" height="12" rx="0.9" fill="#7c8593" />
        <circle cx="35.1" cy="12" r="2.7" fill="#8a929f" />
        <circle cx="35.1" cy="11.6" r="1.3" fill="#0c0f14" />
      </g>
      {/* Sprite with its body box, drawn over the wall */}
      <rect x="15" y="14" width="16" height="23" fill="none" stroke="#5a9bff" strokeWidth="1.3" />
      <rect x="20" y="16" width="7" height="6" fill="#e8b16b" />
      <rect x="21" y="17.5" width="1.6" height="1.6" fill="#232a33" />
      <rect x="24.4" y="17.5" width="1.6" height="1.6" fill="#232a33" />
      <rect x="18.5" y="22" width="12" height="9" fill="#5a9bff" />
      <rect x="16" y="23" width="2.5" height="7" fill="#e8b16b" />
      <rect x="30.5" y="23" width="2.5" height="7" fill="#e8b16b" />
      <rect x="20" y="31" width="3.5" height="6" fill="#37414f" />
      <rect x="25.5" y="31" width="3.5" height="6" fill="#37414f" />
      {/* Bench the sprite stands on */}
      <rect x="6" y="37" width="36" height="4" rx="1.2" fill="#a5642e" />
      <rect x="6" y="37" width="36" height="1.4" fill="#c9853f" />
      <rect x="10" y="41" width="3" height="5" fill="#6f4420" />
      <rect x="35" y="41" width="3" height="5" fill="#6f4420" />
    </svg>
  );
}
