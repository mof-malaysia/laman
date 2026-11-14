/**
 * Site colours: the primary ramp an agency's site uses in place of FTDS Blue.
 * The renderer writes it over FTDS's `--_primary-*` primitives; every semantic
 * token (buttons, links, tags, focus rings) points at those, so nothing else
 * changes. Ramps are made from one colour in OKLCH and must pass `rampPasses`,
 * the WCAG 2.2 AA contrast the FTDS components rely on.
 */

export type Rgb = [number, number, number];

export const rampSteps = [
  "50",
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
  "950",
] as const;
export type RampStep = (typeof rampSteps)[number];
export type Ramp = Record<RampStep, Rgb>;

/** FTDS Blue, as `ftds.css` ships it. */
export const ftdsPrimary: Ramp = {
  "50": [239, 246, 255],
  "100": [219, 234, 254],
  "200": [194, 213, 255],
  "300": [150, 183, 255],
  "400": [99, 148, 255],
  "500": [58, 117, 246],
  "600": [37, 99, 235],
  "700": [29, 78, 216],
  "800": [30, 64, 175],
  "900": [30, 58, 138],
  "950": [23, 37, 84],
};

const white: Rgb = [255, 255, 255];
/** FTDS `bg-washed`, the grey panels links also sit on. */
const washed: Rgb = [244, 244, 245];

/** What each checked step is for, as the admin names it. */
export type RampUse = "wash" | "focus" | "text" | "hover";
export const rampUses: { step: RampStep; use: RampUse }[] = [
  { step: "50", use: "wash" },
  { step: "500", use: "focus" },
  { step: "600", use: "text" },
  { step: "700", use: "hover" },
];

type Rule = { step: RampStep; against: Rgb | RampStep; min: number };

/**
 * Where FTDS uses the ramp for something people have to read or see: links and
 * button fills (600, with white text, also on grey and primary washes), the
 * hover fill (700), the focus ring (500, non-text), tag text on its wash (700).
 */
const rules: Rule[] = [
  { step: "600", against: white, min: 4.5 },
  { step: "600", against: washed, min: 4.5 },
  { step: "600", against: "50", min: 4.5 },
  { step: "700", against: white, min: 4.5 },
  { step: "700", against: "100", min: 4.5 },
  { step: "500", against: white, min: 3 },
];

/** An sRGB channel, 0–255, as linear light, 0–1. */
const toLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/** WCAG 2.x relative luminance of an sRGB colour. */
const luminance = ([r, g, b]: Rgb) =>
  0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

/** WCAG contrast ratio, 1 to 21. */
export function contrast(a: Rgb, b: Rgb) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * Whether `rgb` meets every rule for `step`. Rules against another step use
 * `ramp`; without one, only the rules against fixed colours count.
 */
const meetsRules = (step: RampStep, rgb: Rgb, ramp?: Ramp) =>
  rules.every(
    (r) =>
      r.step !== step ||
      (typeof r.against === "string"
        ? !ramp || contrast(rgb, ramp[r.against]) >= r.min
        : contrast(rgb, r.against) >= r.min),
  );

/** Whether the ramp is safe to publish: every step people read meets its contrast. */
export const rampPasses = (ramp: Ramp) => rampSteps.every((s) => meetsRules(s, ramp[s], ramp));

// OKLab / OKLCH (Björn Ottosson). L is 0–1, C is chroma, H is degrees.
type Lch = { l: number; c: number; h: number };

const fromLinear = (v: number) =>
  255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

function toLch(rgb: Rgb): Lch {
  const [r, g, b] = rgb.map(toLinear) as Rgb;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}

/** Linear sRGB of an OKLCH colour; may fall outside 0–1. */
function lchToLinear({ l: L, c, h }: Lch): Rgb {
  const A = c * Math.cos((h * Math.PI) / 180);
  const B = c * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb: Rgb) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** The largest value from 0 to `hi` that passes `ok`, which holds at 0 and fails above some point. */
function bisect(hi: number, ok: (value: number) => boolean) {
  if (ok(hi)) return hi;
  let lo = 0;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** The colour, with chroma lowered until sRGB can show it. */
function fromLch(lch: Lch): Rgb {
  const c = bisect(lch.c, (chroma) => inGamut(lchToLinear({ ...lch, c: chroma })));
  const linear = lchToLinear({ ...lch, c });
  return linear.map((v) => Math.round(Math.min(255, Math.max(0, fromLinear(v))))) as Rgb;
}

/** The lightest version of `lch` (same hue and chroma) that passes `ok`. */
const darkenUntil = (lch: Lch, ok: (rgb: Rgb) => boolean): Lch => ({
  ...lch,
  l: bisect(lch.l, (l) => ok(fromLch({ ...lch, l }))),
});

const ftdsLch = Object.fromEntries(rampSteps.map((s) => [s, toLch(ftdsPrimary[s])])) as Record<
  RampStep,
  Lch
>;

export type GeneratedRamp = {
  ramp: Ramp;
  /** The step that is exactly the seed; null if it had to be darkened for contrast. */
  seedStep: RampStep | null;
};

/**
 * A primary ramp from one colour. The seed becomes 600, the button and link
 * colour, when it's dark enough to read on white; failing that 500, the focus
 * ring; failing that the light step nearest its lightness, for washes. The
 * other steps follow FTDS Blue's curve, stretched to meet the seed, in its
 * hue. Steps 500–700 are then darkened where needed until `rampPasses`.
 */
export function rampFrom(seed: Rgb): GeneratedRamp {
  const base = toLch(seed);
  const light = rampSteps.slice(0, rampSteps.indexOf("400") + 1);
  const anchor: RampStep = meetsRules("600", seed)
    ? "600"
    : meetsRules("500", seed)
      ? "500"
      : light.reduce((best, s) =>
          Math.abs(ftdsLch[s].l - base.l) < Math.abs(ftdsLch[best].l - base.l) ? s : best,
        );
  const at = rampSteps.indexOf(anchor);
  const top = ftdsLch["50"].l;
  const scale = ftdsLch[anchor].c > 0 ? base.c / ftdsLch[anchor].c : 0;
  const lch = Object.fromEntries(
    rampSteps.map((s, i) => {
      const f = ftdsLch[s];
      // Lighter steps run from FTDS's 50 to the seed; darker ones scale with it.
      const l =
        i < at && anchor !== "50"
          ? top + ((f.l - top) * (base.l - top)) / (ftdsLch[anchor].l - top)
          : (f.l * base.l) / ftdsLch[anchor].l;
      return [s, { l, c: f.c * scale, h: base.h }];
    }),
  ) as Record<RampStep, Lch>;
  lch[anchor] = base;

  const ramp = Object.fromEntries(rampSteps.map((s) => [s, fromLch(lch[s])])) as Ramp;
  ramp[anchor] = seed;
  for (const step of ["500", "600", "700"] as const) {
    const ok = (rgb: Rgb) => meetsRules(step, rgb, ramp);
    if (ok(ramp[step])) continue;
    lch[step] = darkenUntil(lch[step], ok);
    ramp[step] = fromLch(lch[step]);
    // Darker steps stay darker.
    for (let i = rampSteps.indexOf(step) + 1; i < rampSteps.length; i++) {
      const s = rampSteps[i]!;
      const prev = lch[rampSteps[i - 1]!];
      if (lch[s].l < prev.l) break;
      lch[s] = { ...lch[s], l: Math.max(0, prev.l - 0.04) };
      ramp[s] = fromLch(lch[s]);
    }
  }
  // Darkening replaces the step's colour, so the seed is still there only if it wasn't.
  return { ramp, seedStep: ramp[anchor] === seed ? anchor : null };
}

export const hexPattern = /^#[0-9a-f]{6}$/i;

export function hexToRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const rgbToHex = (rgb: Rgb) =>
  `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;

/**
 * Tested starting points, made by `rampFrom` from their seed; `ftds` is FTDS
 * Blue as shipped, so its value is only a label.
 */
export const themePresets = {
  ftds: "#2563eb",
  green: "#0b6b3a",
  teal: "#0f6e78",
  navy: "#1f3a6e",
  maroon: "#8a1c2b",
  purple: "#5b2a86",
} as const;
export type ThemePreset = keyof typeof themePresets;

const ftds: GeneratedRamp = { ramp: ftdsPrimary, seedStep: "600" };

/** The ramp a preset or custom seed publishes with. */
export function rampFor(preset: ThemePreset | "custom", seed?: string): GeneratedRamp {
  const hex = preset === "custom" ? seed : themePresets[preset];
  return preset === "ftds" || !hex || !hexPattern.test(hex) ? ftds : rampFrom(hexToRgb(hex));
}

/**
 * The site's second brand colour, for decoration only: brand bars, icon
 * badges, figures, date tiles and the accent hero wash, never anything people
 * click. Links, buttons and focus rings stay primary, so visitors learn one
 * colour for "this does something". `seed` is the colour as given, which the
 * bars use; the ramp is made like primary's, so 700 reads on the 50 wash.
 */
export type Accent = { seed: Rgb; ramp: Ramp };

/** The accent from the officer's colour. */
export const accentFrom = (hex: string): Accent => {
  const seed = hexToRgb(hex);
  return { seed, ramp: rampFrom(seed).ramp };
};

/**
 * Whether the accent can sit beside primary: its own ramp passes, and primary
 * links and buttons still read on the accent wash, since an accent hero puts
 * them there.
 */
export const accentPasses = (primary: Ramp, accent: Ramp) =>
  rampPasses(accent) && contrast(primary["600"], accent["50"]) >= 4.5;

/**
 * Whether the accent is too like primary to read as a second colour: a
 * similar hue at a similar lightness, or both nearly grey. A warning, not a
 * rule; some brands are two blues.
 */
export function accentTooClose(primary: Rgb, accent: Rgb) {
  const [a, b] = [toLch(primary), toLch(accent)];
  if (a.c < 0.04 && b.c < 0.04) return Math.abs(a.l - b.l) < 0.2;
  const hue = Math.abs(a.h - b.h) % 360;
  return Math.min(hue, 360 - hue) < 30 && Math.abs(a.l - b.l) < 0.15;
}

/** A preset or the officer's colour, and the ramp it publishes with: the stored theme. */
export const themeOf = (choice: {
  preset: ThemePreset | "custom";
  seed?: string | undefined;
  accent?: string | undefined;
}) => ({
  preset: choice.preset,
  ...(choice.preset === "custom" ? { seed: choice.seed?.toLowerCase() } : {}),
  primary: rampFor(choice.preset, choice.seed).ramp,
  ...(choice.accent && {
    accent: choice.accent.toLowerCase(),
    accentRamp: accentFrom(choice.accent).ramp,
  }),
});

/** `--_primary-50:239 246 255;…`, the declarations the renderer writes on `:root`. */
const rampCss = (ramp: Ramp, name: "primary" | "accent" = "primary") =>
  rampSteps.map((s) => `--_${name}-${s}:${ramp[s].join(" ")};`).join("");

/**
 * Everything `#site-theme` writes on `:root`: the primary ramp and, with an
 * accent, its ramp, its colour as given (`--_accent-brand`) and the brand
 * bars' height. Without an accent the accent tokens in `global.css` fall back
 * to primary and the bars to nothing, so the page is as it was.
 */
export const themeCss = (theme: { primary: Ramp; accent?: Accent | undefined }) =>
  rampCss(theme.primary) +
  (theme.accent
    ? `${rampCss(theme.accent.ramp, "accent")}--_accent-brand:${theme.accent.seed.join(" ")};--_accent-bar:4px;`
    : "");
