/**
 * t("key", { name }) looks up a message and fills its `{name}` placeholders.
 * Keys are typed: a missing or misspelt key is a type error.
 */
import { en } from "./messages/en";

export type MessageKey = keyof typeof en;

export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const message: string = en[key];
  if (!params) return message;
  return message.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
