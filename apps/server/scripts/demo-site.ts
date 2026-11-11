/**
 * Seeds a demo agency, Jabatan Contoh, into a running builder through its
 * API, for the marketing site's screenshots (apps/www). The agency is made
 * up and says so; run it against a throwaway DATA_DIR, never a real site.
 *
 *   DEMO_URL=http://127.0.0.1:3020 DEMO_USER=… DEMO_PASS=… DEMO_NEW_PASS=… \
 *     pnpm --filter @fiscal-sb/server exec tsx scripts/demo-site.ts
 *
 * DEMO_USER and DEMO_PASS are the first account from the server's
 * environment; DEMO_NEW_PASS is the password it must change to at first
 * sign-in (pass the same one again to run the script a second time).
 */
import {
  type Block,
  type ListingSettings,
  type PageDocument,
  addDays,
  dayOf,
  newBlock,
  templateById,
} from "@fiscal-sb/blocks";
import type { Announcement, Me, PageSummary, SiteSettings } from "@fiscal-sb/contracts";

const base = process.env.DEMO_URL ?? "http://127.0.0.1:3020";
const username = process.env.DEMO_USER ?? "demo";
const password = process.env.DEMO_PASS;
const newPassword = process.env.DEMO_NEW_PASS;
if (!password || !newPassword) throw new Error("Set DEMO_PASS and DEMO_NEW_PASS.");

let cookie = "";
async function call<T = Record<string, unknown>>(method: string, path: string, body?: object) {
  const response = await fetch(base + path, {
    method,
    headers: { cookie, ...(body && { "content-type": "application/json" }) },
    ...(body && { body: JSON.stringify(body) }),
  });
  const set = response.headers.getSetCookie();
  if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
  if (response.status >= 400)
    throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
  return (response.status === 204 ? undefined : ((await response.json()) as { data: T }).data) as T;
}

// Sign in, changing the first password if the server still asks for it; a
// second run signs in with the new one.
let me: Me;
try {
  me = await call<Me>("POST", "/api/auth/sign-in", { username, password });
  if (me.stage === "password") await call("POST", "/api/auth/password", { password: newPassword });
} catch {
  me = await call<Me>("POST", "/api/auth/sign-in", { username, password: newPassword });
}

const page = (id: string) =>
  call<{ draft: PageDocument; draftVersion: string }>("GET", `/api/pages/${id}`);
async function change(id: string, edit: (draft: PageDocument) => PageDocument) {
  const { draft, draftVersion } = await page(id);
  await call("PUT", `/api/pages/${id}/draft`, { draft: edit(draft), base: draftVersion });
}
const publish = (id: string) => call("POST", `/api/pages/${id}/publish`);
async function site<T>(name: string, edit: (draft: T) => T) {
  const { draft, version } = await call<{ draft: T; version: string }>("GET", `/api/${name}`);
  await call("PUT", `/api/${name}`, { draft: edit(draft), base: version });
  await call("POST", `/api/${name}/publish`);
}
const pages = await call<PageSummary[]>("GET", "/api/pages");
const bySlug = (slug: string) => pages.find((p) => p.slug === slug)?.id;
async function create(title: string, slug: string, template?: string) {
  return (
    bySlug(slug) ?? (await call<{ id: string }>("POST", "/api/pages", { title, slug, template })).id
  );
}

await site<SiteSettings>("settings", (d) => ({
  ...d,
  identity: {
    ...d.identity,
    siteName: "Jabatan Contoh",
    agencyName: "Jabatan Contoh (agensi rekaan)",
  },
  // Dashboards and maps from these services may be framed (Settings, Embeds).
  embeds: { services: ["powerBi", "lookerStudio", "youtube", "openStreetMap"], hosts: [] },
  contact: {
    address: "Aras 3, Menara Contoh\nJalan Contoh 1, Presint 9\n62000 Putrajaya",
    phone: "03-0000 0000",
    email: "",
    hours: "Isnin hingga Jumaat, 8.00 pagi hingga 5.00 petang",
  },
}));

// The home page from the Utama template; services and contact from theirs.
const home = pages.find((p) => p.parentId === null)!.id;
// Fields the template leaves empty, filled in so the canvas shows no empty-field placeholders.
const filled: Partial<Record<Block["type"], Record<string, string>>> = {
  hero: { footnote: "Perkhidmatan dalam talian dibuka 24 jam sehari." },
  serviceHighlights: { description: "Urusan yang paling kerap dibuat oleh orang ramai." },
};
// The Takwim: a calendar of the agency's events, by team and location, dated from today.
const takwim = await create("Takwim", "takwim", "takwim");
const { settings: takwimSettings } = await call<{ settings: ListingSettings }>(
  "GET",
  `/api/pages/${takwim}/listing`,
);
await call("PUT", `/api/pages/${takwim}/listing`, {
  settings: {
    ...takwimSettings,
    categories: [
      { slug: "khidmat-pelanggan", name: "Khidmat Pelanggan" },
      { slug: "teknologi", name: "Teknologi Maklumat" },
      { slug: "pengurusan", name: "Pengurusan" },
    ],
    locations: [
      { slug: "ibu-pejabat", name: "Ibu pejabat" },
      { slug: "cawangan", name: "Cawangan Seksyen 9" },
      { slug: "dalam-talian", name: "Dalam talian" },
    ],
  },
});
await change(takwim, (d) => ({
  ...d,
  ms: {
    ...d.ms,
    blocks: d.ms.blocks.map((b) =>
      b.type === "eventCalendar"
        ? ({ ...b, props: { ...b.props, categoryLabel: "Bahagian" } } as Block)
        : b,
    ),
  },
}));
await publish(takwim);
const today = dayOf(Date.now());
const at = (days: number, time: string) => `${addDays(today, days)}T${time}:00+08:00`;
const events: {
  title: string;
  category: string;
  start: string;
  end?: string;
  allDay?: boolean;
  location: string;
  venue: string;
  pinned?: boolean;
}[] = [
  {
    title: "Mesyuarat pengurusan bulanan",
    category: "pengurusan",
    start: at(-6, "09:00"),
    end: at(-6, "11:00"),
    location: "ibu-pejabat",
    venue: "Bilik Mesyuarat Utama, Aras 3",
  },
  {
    title: "Taklimat sistem temu janji baharu",
    category: "teknologi",
    start: at(-2, "14:30"),
    end: at(-2, "16:00"),
    location: "dalam-talian",
    venue: "Microsoft Teams",
  },
  {
    title: "Hari Bertemu Pelanggan",
    category: "khidmat-pelanggan",
    start: at(1, "00:00"),
    end: at(2, "00:00"),
    allDay: true,
    location: "cawangan",
    venue: "Dewan Serbaguna, Seksyen 9",
    pinned: true,
  },
  {
    title: "Latihan kaunter untuk staf baharu",
    category: "khidmat-pelanggan",
    start: at(1, "09:00"),
    end: at(1, "12:30"),
    location: "ibu-pejabat",
    venue: "Bilik Latihan, Aras 2",
  },
  {
    title: "Klinik papan pemuka untuk pemilik laporan",
    category: "teknologi",
    start: at(3, "14:30"),
    end: at(3, "16:00"),
    location: "dalam-talian",
    venue: "Microsoft Teams",
  },
  {
    title: "Mesyuarat jawatankuasa keselamatan",
    category: "pengurusan",
    start: at(6, "10:00"),
    end: at(6, "12:00"),
    location: "ibu-pejabat",
    venue: "Bilik Lembaga, Aras 5",
  },
  {
    title: "Sesi libat urus penduduk",
    category: "khidmat-pelanggan",
    start: at(9, "20:00"),
    end: at(9, "22:00"),
    location: "cawangan",
    venue: "Balai Raya Seksyen 9",
  },
  {
    title: "Penyelenggaraan sistem dalam talian",
    category: "teknologi",
    start: at(13, "00:00"),
    allDay: true,
    location: "dalam-talian",
    venue: "Semua perkhidmatan dalam talian",
  },
  {
    title: "Majlis penghargaan warga jabatan",
    category: "pengurusan",
    start: at(16, "19:30"),
    end: at(16, "22:30"),
    location: "ibu-pejabat",
    venue: "Dewan Utama",
  },
];
const { items: takwimEntries } = await call<{ items: { id: string; title: string }[] }>(
  "GET",
  `/api/pages/${takwim}/entries?pageSize=100`,
);
for (const { title, category, pinned, ...event } of events) {
  const id =
    takwimEntries.find((e) => e.title === title)?.id ??
    (await call<{ id: string }>("POST", `/api/pages/${takwim}/entries`, { title })).id;
  await change(id, (d) => ({
    ...d,
    entry: { ...d.entry!, category, ...(pinned && { pinned }), event },
  }));
  await publish(id);
}
await publish(takwim);

const homeBlocks = templateById("utama")
  .blocks("Perkhidmatan Jabatan Contoh, di satu tempat")
  .map((b) => ({ ...b, props: { ...b.props, ...filled[b.type] } }) as Block);
// The next events from the Takwim, before the last block.
const upcoming = {
  ...newBlock("upcomingEvents"),
  props: { ...newBlock("upcomingEvents").props, listing: takwim },
} as Block;
homeBlocks.splice(homeBlocks.length - 1, 0, upcoming);
await change(home, (d) => ({ ...d, ms: { ...d.ms, blocks: homeBlocks } }));
await publish(home);
await publish(await create("Perkhidmatan", "perkhidmatan", "perkhidmatan"));
const contact = await create("Hubungi kami", "hubungi", "hubungi");
await publish(contact);

// Notices, with one entry: the office closure the announcement points at.
const notis = await create("Notis", "notis", "pengumuman");
await publish(notis);
const { items: entries } = await call<{ items: { id: string; slug: string }[] }>(
  "GET",
  `/api/pages/${notis}/entries`,
);
const closure =
  entries.find((e) => e.slug.startsWith("pejabat-ditutup"))?.id ??
  (
    await call<{ id: string }>("POST", `/api/pages/${notis}/entries`, {
      title: "Pejabat ditutup pada 12 November 2026",
    })
  ).id;
await change(closure, (d) => ({
  ...d,
  entry: {
    ...d.entry!,
    summary: "Pejabat ditutup sementara kerana banjir. Urusan kaunter di cawangan Seksyen 9.",
  },
}));
await publish(closure);

await site<Announcement>("announcement", (d) => ({
  ...d,
  on: true,
  tag: "Notis",
  variant: "warning",
  message: "Pejabat ditutup 12 November. Urusan kaunter di cawangan Seksyen 9.",
  scope: "all",
}));

// A draft with what the checks before publishing catch: no h1, a "klik sini" link.
const draft = await create("Notis banjir", "notis-banjir");
await change(draft, (d) => ({
  ...d,
  ms: {
    ...d.ms,
    blocks: [
      {
        ...newBlock("linkList"),
        props: {
          title: "Maklumat banjir",
          items: [{ label: "Klik sini", href: "/notis" }],
          layout: "list",
        },
      } as Block,
    ],
  },
}));

// A publishable change waiting, for the Publishing screen: the contact page's description.
await change(contact, (d) => ({
  ...d,
  // Different from what's live on every run, so there's always a change waiting.
  ms: {
    ...d.ms,
    description:
      d.ms.description === "Alamat, telefon dan waktu operasi Jabatan Contoh."
        ? "Alamat, telefon dan waktu operasi pejabat Jabatan Contoh."
        : "Alamat, telefon dan waktu operasi Jabatan Contoh.",
  },
}));

console.log(`Jabatan Contoh is on ${base}. Signed in as ${username} (stage ${me.stage}).`);
