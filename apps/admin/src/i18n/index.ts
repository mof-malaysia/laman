/**
 * t("key", { name }) looks up a message and fills its `{name}` placeholders.
 * Keys are typed: a missing or misspelt key is a type error. A message
 * with a {count} can have a singular form under "<key>.one".
 *
 * The language is set once, before the app's modules load (index.tsx), so
 * formatters made at module level read it too. Changing it reloads the admin.
 */
import type { AdminLanguage } from "@fiscal-sb/contracts";
import { en } from "./messages/en";

export type MessageKey = keyof typeof en;

const locales: Record<AdminLanguage, string> = { en: "en-MY", ms: "ms-MY" };

let language: AdminLanguage = "en";
/** English is always here; BM is fetched only when it's the language. */
let messages: Record<string, string> = en;

export async function setLanguage(next: AdminLanguage) {
  messages = next === "ms" ? (await import("./messages/ms")).ms : en;
  language = next;
  document.documentElement.lang = next;
}

export const currentLanguage = () => language;

/** The Intl locale for dates and numbers: "en-MY" or "ms-MY". */
export const locale = () => locales[language];

/** With `count: 1`, uses the "<key>.one" message when there is one: "1 page", not "1 pages". */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const message =
    (params?.count === 1 && messages[`${key}.one`]) || messages[key] || en[key] || key;
  if (!params) return message;
  return message.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
