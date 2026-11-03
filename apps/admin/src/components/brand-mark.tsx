/**
 * Laman's mark, beside its name in the sidebar and on the sign-in screens: four
 * blocks turning around an open square, the laman the blocks make together.
 * The favicon (`src/assets/favicon.svg`) and `docs/logo.svg` are the same
 * drawing on a hard-coded primary tile.
 */
export function BrandMark() {
  return (
    <span aria-hidden className="bg-bg-primary-600 text-txt-white size-7 shrink-0 rounded-md">
      <svg viewBox="0 0 40 40" fill="currentColor" className="size-full">
        <rect x="9" y="9" width="14.2" height="6" rx="2" />
        <rect x="25" y="9" width="6" height="14.2" rx="2" />
        <rect x="16.8" y="25" width="14.2" height="6" rx="2" />
        <rect x="9" y="16.8" width="6" height="14.2" rx="2" />
      </svg>
    </span>
  );
}
