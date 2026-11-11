/**
 * The Pages index's line icons: drawn on a 20px grid with 1.4px round strokes
 * and no fills, so they sit lighter than the FTDS glyphs on a screen that is
 * mostly lists. Sized by the caller (`size-4`, `size-5`); colour is currentColor.
 */
import type { SVGProps } from "react";

type Props = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: Props) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export const SearchGlyph = (p: Props) => (
  <Icon {...p}>
    <circle cx="9" cy="9" r="5.25" />
    <path d="m13 13 3.5 3.5" />
  </Icon>
);

export const PageGlyph = (p: Props) => (
  <Icon {...p}>
    <path d="M5.75 3.75h5.5l3 3v9.5h-8.5z" />
    <path d="M11.25 3.75v3h3" />
  </Icon>
);

export const CollectionGlyph = (p: Props) => (
  <Icon {...p}>
    <rect x="4.25" y="7.75" width="11.5" height="8.5" rx="1.75" />
    <path d="M6 5.25h8M7.75 2.75h4.5" />
  </Icon>
);

export const HomeGlyph = (p: Props) => (
  <Icon {...p}>
    <path d="M4.25 8.75 10 4.25l5.75 4.5v7.5H4.25z" />
    <path d="M8.25 16.25v-4h3.5v4" />
  </Icon>
);

export const PlusGlyph = (p: Props) => (
  <Icon {...p}>
    <path d="M10 4.75v10.5M4.75 10h10.5" />
  </Icon>
);

export const ChevronGlyph = (p: Props) => (
  <Icon {...p}>
    <path d="m8.25 5.75 4.25 4.25-4.25 4.25" />
  </Icon>
);

export const EyeGlyph = (p: Props) => (
  <Icon {...p}>
    <path d="M2.75 10S5.25 5.25 10 5.25 17.25 10 17.25 10 14.75 14.75 10 14.75 2.75 10 2.75 10z" />
    <circle cx="10" cy="10" r="2.25" />
  </Icon>
);

export const PenGlyph = (p: Props) => (
  <Icon {...p}>
    <path d="m12.75 4.75 2.5 2.5-7.5 7.5H5.25v-2.5z" />
  </Icon>
);

export const ReturnGlyph = (p: Props) => (
  <Icon {...p}>
    <path d="M15.25 5.25v3.5a2 2 0 0 1-2 2h-8.5" />
    <path d="m7.75 7.75-3 3 3 3" />
  </Icon>
);

export const CheckGlyph = (p: Props) => (
  <Icon {...p}>
    <path d="m5.25 10.25 3 3 6.5-6.5" />
  </Icon>
);

/** The page's own glyph, by kind. */
export function KindGlyph({
  page,
  ...props
}: { page: { kind: string; parentId: string | null } } & Props) {
  if (page.parentId === null) return <HomeGlyph {...props} />;
  return page.kind === "listing" ? <CollectionGlyph {...props} /> : <PageGlyph {...props} />;
}

export const DotsGlyph = (p: Props) => (
  <Icon {...p}>
    <circle cx="5" cy="10" r=".9" fill="currentColor" />
    <circle cx="10" cy="10" r=".9" fill="currentColor" />
    <circle cx="15" cy="10" r=".9" fill="currentColor" />
  </Icon>
);

export const TrashGlyph = (p: Props) => (
  <Icon {...p}>
    <path d="M4.75 6h10.5M8.25 6V4.25h3.5V6M6.25 6l.6 9.75h6.3l.6-9.75" />
  </Icon>
);

export const UploadGlyph = (p: Props) => (
  <Icon {...p}>
    <path d="M10 13.25v-8.5M6.5 8.25 10 4.75l3.5 3.5M4.75 15.25h10.5" />
  </Icon>
);

export const SlidersGlyph = (p: Props) => (
  <Icon {...p}>
    <path d="M4.75 6.5h6.5M14.75 6.5h.5M4.75 13.5h.5M8.75 13.5h6.5" />
    <circle cx="13" cy="6.5" r="1.75" />
    <circle cx="7" cy="13.5" r="1.75" />
  </Icon>
);
