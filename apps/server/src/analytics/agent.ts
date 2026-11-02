/**
 * Browser, operating system and device type from a user agent, coarsely: the
 * names a report lists, not versions. Order matters: Edge and Opera say
 * "Chrome" too, and Chrome says "Safari".
 */
const browsers: [RegExp, string][] = [
  [/\bEdg(e|A|iOS)?\//, "Edge"],
  [/\b(OPR|Opera)\//, "Opera"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\bYaBrowser\//, "Yandex"],
  [/\bUCBrowser\//, "UC Browser"],
  [/\b(Firefox|FxiOS)\//, "Firefox"],
  [/\b(Chrome|CriOS|Chromium)\//, "Chrome"],
  [/\bVersion\/[\d.]+.*Safari\//, "Safari"],
  [/\bMSIE |Trident\//, "Internet Explorer"],
];

const systems: [RegExp, string][] = [
  [/\b(iPhone|iPad|iPod)\b/, "iOS"],
  [/\bAndroid\b/, "Android"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bWindows\b/, "Windows"],
  [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
  [/\bLinux\b/, "Linux"],
];

export type Agent = { browser: string; os: string; device: "desktop" | "mobile" | "tablet" };

export function parseAgent(ua: string): Agent {
  const browser = browsers.find(([re]) => re.test(ua))?.[1] ?? "";
  const os = systems.find(([re]) => re.test(ua))?.[1] ?? "";
  const tablet =
    /\biPad\b|\bTablet\b/.test(ua) || (/\bAndroid\b/.test(ua) && !/\bMobile\b/.test(ua));
  const mobile = /\bMobi(le)?\b|\biPhone\b|\biPod\b/.test(ua);
  return { browser, os, device: tablet ? "tablet" : mobile ? "mobile" : "desktop" };
}

/** Screen width in CSS pixels, as one of four buckets. */
export function screenBucket(width: number | undefined) {
  if (!width) return "";
  if (width < 640) return "s";
  if (width < 1024) return "m";
  if (width < 1440) return "l";
  return "xl";
}

/** "en-GB" → "en". */
export const primaryLanguage = (tag: string | undefined) =>
  /^[a-z]{2,3}/i.exec(tag ?? "")?.[0]?.toLowerCase() ?? "";
