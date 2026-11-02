// .astro components imported from plain .ts modules (src/blocks/icons.ts).
declare module "*.astro" {
  const Component: (props: Record<string, unknown>) => unknown;
  export default Component;
}
