/** An action is rendered only once both its label and link are filled in. */
export const action = (value?: { label: string; href: string }) =>
  value?.label && value.href ? value : undefined;
