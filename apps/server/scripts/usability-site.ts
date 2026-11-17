/**
 * Seeds the usability test site (docs/usability/README.md) into a fresh,
 * running builder through its API: Jabatan Contoh, a made-up agency, set up
 * for walkthroughs A, B and D in docs/admin-evaluation.md.
 *
 *   A: the opening hours are in the site settings (Contact), live, and nowhere else.
 *   B: no announcement is live; a few pages are, to check the result against.
 *   D: a known set of changes is waiting: Perkhidmatan has a newer draft, the
 *      navigation has a new link, and Soalan lazim has never been published.
 *
 *   USABILITY_URL=http://127.0.0.1:8080 USABILITY_USER=pentadbir USABILITY_PASS=… \
 *     pnpm --filter @laman/server exec tsx scripts/usability-site.ts
 *
 * USABILITY_USER is an Admin or the super admin, already signed in once (so
 * its first password has been changed) and without two-factor. Run it against
 * a throwaway install, never a real site. It ends by checking what's waiting
 * and fails if that isn't exactly the list the kit gives.
 */
import { type Block, newBlock, templateById } from "@laman/blocks";
import type { Announcement, Navigation, SiteSettings, WaitingItem } from "@laman/contracts";
import { connect } from "./api.js";

const base = process.env.USABILITY_URL ?? "http://127.0.0.1:8080";
const username = process.env.USABILITY_USER ?? "pentadbir";
const password = process.env.USABILITY_PASS;
if (!password) throw new Error("Set USABILITY_PASS to the password of USABILITY_USER.");

const { call, signIn, change, publish, pages, createPage, saveSite, site } = await connect(base);
const me = await signIn(username, password);
if (me.stage !== "full")
  throw new Error(
    `${username} isn't fully signed in (stage ${me.stage}). Sign in once in the admin first: choose a new password, and leave two-factor off on the test site.`,
  );

/** The hours task A changes. The kit quotes this line. */
const hours = "8.00 pagi hingga 5.00 petang, Isnin hingga Jumaat";

await site<SiteSettings>("settings", (d) => ({
  ...d,
  identity: {
    ...d.identity,
    siteName: "Jabatan Contoh",
    agencyName: "Jabatan Contoh (agensi rekaan)",
  },
  contact: {
    address: "Aras 3, Menara Contoh\nJalan Contoh 1, Presint 9\n62000 Putrajaya",
    phone: "03-0000 0000",
    email: "",
    hours,
  },
}));
// B starts with no announcement: off, and nothing waiting to go live.
await site<Announcement>("announcement", (d) => ({ ...d, on: false }));

/** Sets a block's props on a page's draft, by block type. */
const withProps =
  (type: Block["type"], props: Record<string, unknown>) =>
  (blocks: Block[]): Block[] =>
    blocks.map((b) => (b.type === type ? ({ ...b, props: { ...b.props, ...props } } as Block) : b));

const home = (await pages()).find((p) => p.parentId === null)!.id;
await change(home, (d) => ({
  ...d,
  ms: {
    ...d.ms,
    blocks: withProps("hero", { footnote: "Perkhidmatan dalam talian dibuka 24 jam sehari." })(
      templateById("utama").blocks("Perkhidmatan Jabatan Contoh, di satu tempat"),
    ),
  },
}));
await publish(home);

const intro = (description: string) => withProps("pageIntro", { description });
const perkhidmatan = await createPage("Perkhidmatan", "perkhidmatan", "perkhidmatan");
const liveIntro = "Mohon lesen premis perniagaan dan semak status permohonan anda.";
await change(perkhidmatan, (d) => ({
  ...d,
  ms: { ...d.ms, blocks: intro(liveIntro)(d.ms.blocks) },
}));
await publish(perkhidmatan);

const hubungi = await createPage("Hubungi kami", "hubungi", "hubungi");
await publish(hubungi);

const notis = await createPage("Notis", "notis", "pengumuman");
await publish(notis);
const { items: entries } = await call<{ items: { id: string; title: string }[] }>(
  "GET",
  `/api/pages/${notis}/entries`,
);
const entryTitle = "Sistem temu janji dalam talian kini dibuka";
const entry =
  entries.find((e) => e.title === entryTitle)?.id ??
  (await call<{ id: string }>("POST", `/api/pages/${notis}/entries`, { title: entryTitle })).id;
await change(entry, (d) => ({
  ...d,
  entry: {
    ...d.entry!,
    summary: "Orang ramai kini boleh membuat temu janji kaunter melalui laman web.",
  },
}));
await publish(entry);

const link = (label: string, pageId: string) =>
  ({ type: "link", label, target: { kind: "page", pageId } }) as const;
await site<Navigation>("navigation", (d) => ({
  ...d,
  navbar: [link("Perkhidmatan", perkhidmatan), link("Hubungi kami", hubungi)],
}));

// D: what's waiting. A newer draft of a live page, a navigation change, a new page.
await change(perkhidmatan, (d) => ({
  ...d,
  ms: {
    ...d.ms,
    blocks: intro(
      "Mohon lesen premis perniagaan dalam talian atau di kaunter, dan semak status permohonan anda.",
    )(d.ms.blocks),
  },
}));
await saveSite<Navigation>("navigation", (d) => ({
  ...d,
  navbar: [link("Perkhidmatan", perkhidmatan), link("Notis", notis), link("Hubungi kami", hubungi)],
}));
const soalan = await createPage("Soalan lazim", "soalan-lazim");
await change(soalan, (d) => ({ ...d, ms: { ...d.ms, blocks: [...d.ms.blocks, newBlock("faq")] } }));

// Check the result against what the kit says.
const settings = await call<{ published: SiteSettings }>("GET", "/api/settings");
if (settings.published.contact.hours !== hours) throw new Error("The live hours aren't the kit's.");
const { items } = await call<{ items: WaitingItem[] }>("GET", "/api/publish/preview");
const waiting = items.map((i) =>
  i.kind === "page" ? `${i.title}${i.new ? " (new)" : ""}` : i.kind,
);
const expected = ["Perkhidmatan", "navigation", "Soalan lazim (new)"];
if (JSON.stringify(waiting) !== JSON.stringify(expected))
  throw new Error(
    `Waiting: ${waiting.join(", ")}. The kit expects ${expected.join(", ")}: seed a fresh install.`,
  );
process.stdout.write(
  `Jabatan Contoh is seeded on ${base}.\nLive hours: ${hours}\nWaiting: ${waiting.join(", ")}\nPages: ${(
    await pages()
  )
    .filter((p) => p.kind !== "entry")
    .map((p) => `${p.title} (${p.status})`)
    .join(", ")}\n`,
);
