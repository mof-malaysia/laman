/**
 * How the admin works for the people using it, not what the site shows. For
 * now one set for the whole site; once there are users, each keeps their own.
 */
import { z } from "zod";

/** The admin's languages: English and Bahasa Melayu. */
export const AdminLanguage = z.enum(["en", "ms"]);
export type AdminLanguage = z.infer<typeof AdminLanguage>;

export const AdminPreferences = z.object({
  language: AdminLanguage,
});
export type AdminPreferences = z.infer<typeof AdminPreferences>;
