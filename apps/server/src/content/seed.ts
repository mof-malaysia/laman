/** The home page a new install starts with, so the first sign-in isn't a blank screen. */
import { newBlock } from "@fiscal-sb/blocks";
import type { Db } from "../db/index.js";
import { createPage } from "./pages.js";

export async function seedIfEmpty(db: Db) {
  const any = await db.selectFrom("pages").select("id").limit(1).executeTakeFirst();
  if (any) return false;
  const hero = newBlock("hero");
  if (hero.type === "hero")
    hero.props = {
      eyebrow: "Selamat datang",
      title: "Perkhidmatan agensi, di satu tempat",
      description: "Bayar, mohon dan semak status permohonan anda dalam talian.",
      primaryAction: { label: "Lihat perkhidmatan", href: "#perkhidmatan" },
      secondaryAction: { label: "Hubungi kami", href: "/hubungi" },
    };
  await createPage(db, {
    title: "Utama",
    slug: "",
    parentId: null,
    template: "utama",
    blocks: [hero, newBlock("featureGrid"), newBlock("callout"), newBlock("ctaBand")],
  });
  return true;
}
