import { type MessageKey, t } from "@/i18n";

/** Bytes as a short size: 512 B, 1.2 KB, 4.8 MB. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let size = bytes / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toFixed(size < 10 ? 1 : 0)} ${units[unit]}`;
}

/** The file types the library takes, for the file chooser. */
export const ACCEPT =
  ".jpg,.jpeg,.png,.webp,.svg,.pdf,image/jpeg,image/png,image/webp,image/svg+xml,application/pdf";

const typeNames = {
  "image/jpeg": "media.type.jpeg",
  "image/png": "media.type.png",
  "image/webp": "media.type.webp",
  "image/svg+xml": "media.type.svg",
  "application/pdf": "media.type.pdf",
} as const satisfies Record<string, MessageKey>;

/** "JPEG image", "PDF document": the type in words, not as a MIME type. */
export const typeName = (type: string) =>
  type in typeNames ? t(typeNames[type as keyof typeof typeNames]) : type;

/** Words that say there's an image without saying what it shows, in BM and English. */
const PLACEHOLDERS = new Set([
  "image",
  "images",
  "img",
  "picture",
  "photo",
  "pic",
  "gambar",
  "foto",
  "imej",
  "grafik",
  "logo",
  "banner",
  "poster",
  "untitled",
  "alt",
  "-",
  ".",
]);

/**
 * Alt text that only clears the warning: a placeholder word, the file name,
 * or a single character. A hint, not a check: it can't tell a good description.
 */
export function looksLikePlaceholder(alt: string, filename: string) {
  const text = alt.trim().toLowerCase();
  if (!text) return false;
  const base = filename.toLowerCase().replace(/\.[a-z0-9]+$/, "");
  return (
    text.length < 3 ||
    PLACEHOLDERS.has(text) ||
    text === base ||
    text === filename.toLowerCase() ||
    /^(img|dsc|image|screenshot)[\s_-]?\d+/.test(text)
  );
}
