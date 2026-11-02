import type { FunctionComponent, SVGProps } from "react";

/** A painter's palette, drawn like the FTDS icons (20px, 1.5 stroke); FTDS has none. */
export const PaletteIcon: FunctionComponent<SVGProps<SVGSVGElement>> = (props) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M10 2.75C5.99594 2.75 2.75 5.99594 2.75 10C2.75 14.0041 5.99594 17.25 10 17.25C10.9665 17.25 11.5 16.6 11.5 15.85C11.5 15.1 10.75 14.75 10.75 13.75C10.75 12.9216 11.4216 12.25 12.25 12.25H13.75C15.683 12.25 17.25 10.683 17.25 8.75C17.25 5.43629 14.0041 2.75 10 2.75Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <circle cx="6.5" cy="9.5" r="1" fill="currentColor" />
    <circle cx="8.75" cy="6.25" r="1" fill="currentColor" />
    <circle cx="12.5" cy="6.5" r="1" fill="currentColor" />
  </svg>
);
