import { z } from "zod";
import { field } from "../fields.js";
import { defineBlock } from "../define.js";

/**
 * Icons a feature, service or navbar link may use, in the picker's groups and order, with
 * each group's English name. The renderer and the admin map each icon to its FTDS icon.
 */
export const featureIconGroups = [
  {
    label: "Places and people",
    icons: [
      "home",
      "govt-office",
      "putrajaya",
      "map",
      "pin",
      "direction",
      "globe",
      "user",
      "user-group",
      "org-chart",
      "accessible",
    ],
  },
  {
    label: "Documents and files",
    icons: [
      "document",
      "document-add",
      "forms",
      "folder",
      "book",
      "pdf",
      "attachment",
      "download",
      "upload",
      "printer",
      "qr-code",
      "table",
    ],
  },
  {
    label: "Time and events",
    icons: ["calendar", "clock", "video", "play", "trophy", "flag", "star", "heart"],
  },
  {
    label: "Services and security",
    icons: [
      "money",
      "check-shield",
      "lock",
      "setting",
      "bolt",
      "desktop",
      "mobile",
      "search",
      "link",
    ],
  },
  {
    label: "Notices and status",
    icons: ["bell", "megaphone", "info", "warning", "check-circle", "question-circle", "thumbs-up"],
  },
  {
    label: "Contact and social",
    icons: [
      "email",
      "phone",
      "chat-bubble",
      "share",
      "whatsapp",
      "telegram",
      "facebook",
      "instagram",
      "twitter-x",
      "youtube",
      "tiktok",
      "linkedin",
      "rss",
    ],
  },
] as const;

type FeatureIcon = (typeof featureIconGroups)[number]["icons"][number];

/** Every feature icon, in the picker's order: the one list, read from the groups. */
export const featureIcons = featureIconGroups.flatMap((group) => group.icons) as [
  FeatureIcon,
  ...FeatureIcon[],
];

/** Each feature icon's name, in English: the admin translates it like other registry text. */
export const featureIconLabels: Record<FeatureIcon, string> = {
  home: "Home",
  "govt-office": "Government office",
  putrajaya: "Putrajaya",
  map: "Map",
  pin: "Location",
  direction: "Directions",
  globe: "Globe",
  user: "Person",
  "user-group": "People",
  "org-chart": "Organisation",
  accessible: "Accessibility",
  document: "Document",
  "document-add": "New document",
  forms: "Form",
  folder: "Folder",
  book: "Book",
  pdf: "PDF",
  attachment: "Attachment",
  download: "Download",
  upload: "Upload",
  printer: "Print",
  "qr-code": "QR code",
  table: "Table",
  calendar: "Calendar",
  clock: "Clock",
  video: "Video",
  play: "Play",
  trophy: "Award",
  flag: "Flag",
  star: "Star",
  heart: "Heart",
  money: "Money",
  "check-shield": "Shield",
  lock: "Lock",
  setting: "Settings",
  bolt: "Energy",
  desktop: "Computer",
  mobile: "Mobile",
  search: "Search",
  link: "Link",
  bell: "Bell",
  megaphone: "Announcement",
  info: "Information",
  warning: "Warning",
  "check-circle": "Tick",
  "question-circle": "Question",
  "thumbs-up": "Thumbs up",
  email: "Email",
  phone: "Phone",
  "chat-bubble": "Chat",
  share: "Share",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  facebook: "Facebook",
  instagram: "Instagram",
  "twitter-x": "X",
  youtube: "YouTube",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  rss: "RSS",
};

/** The icon choice features, services and navigation links share. */
export const featureIcon = field.icon("Icon", featureIcons, featureIconLabels);

const Feature = z.object({
  icon: featureIcon.optional(),
  title: field.text("Title", { max: 80 }),
  description: field.textarea("Description", { max: 240 }).optional(),
  href: field.href().optional(),
});

export const featureGrid = defineBlock({
  type: "featureGrid",
  label: "Feature grid",
  description: "A section title and a grid of features, each with an icon, text and a link.",
  group: "content",
  icon: "grid",
  kinds: ["page", "listing"],
  props: z.object({
    title: field.text("Title", { max: 120, inline: true }).optional(),
    description: field.textarea("Description", { max: 300, inline: true }).optional(),
    columns: field.columns(["2", "3"], "3"),
    surface: field
      .select("Cards", ["none", "sheet"], { none: "No card", sheet: "Card" })
      .default("none"),
    tone: field.tone(),
    features: field.list("Features", Feature, { min: 1, max: 9 }),
  }),
  defaults: {
    title: "Perkhidmatan kami",
    description: "Apa yang boleh anda lakukan dalam talian.",
    columns: "3",
    surface: "none",
    tone: "paper",
    features: [
      { icon: "money", title: "Bayar dalam talian", description: "FPX, kad dan e-dompet." },
      {
        icon: "document",
        title: "Mohon permit",
        description: "Hantar permohonan tanpa ke kaunter.",
      },
      {
        icon: "calendar",
        title: "Tempah janji temu",
        description: "Pilih tarikh dan masa yang sesuai.",
      },
    ],
  },
});
