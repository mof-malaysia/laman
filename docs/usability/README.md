# Usability test kit: first-time officers, walkthroughs A, B and D

For the facilitator. Three to five officers who have never seen Laman each do walkthroughs A, B and D from [admin-evaluation.md](../admin-evaluation.md), on the 1.0 beta, one officer per session of about 45 minutes. This turns the evaluation's judgements into evidence (ROADMAP, Now goal 2) and times the urgent announcement on a phone against the 2-minute target in [publish-model.md](../journeys/publish-model.md) § How we'll know it works.

Everything an officer reads or hears is in BM and English: the consent script, the warm-up questions and the task cards. BM is the default; use English only if the officer asks. Write findings up with [findings-template.md](findings-template.md).

**Never write passwords in this folder, the findings or an issue.** Keep them in your password manager.

## What you need

- A throwaway install of the beta build, reachable from the officer's phone (below). Not a real agency site.
- A laptop for the desktop tasks, with a fresh browser profile or a private window per session.
- The officer's own phone. The announcement is timed on it because it's the phone they would use at 9 pm.
- A stopwatch (a phone you aren't testing with), the printed task cards, and the findings template.
- A checkout of the repository at the same tag as the install, with Node 24.7 or later and pnpm, for the seed script.

## 1. Install the beta (once)

Install `v1.0.0-beta.1` with [install-docker.md](../install-docker.md): check out the tag, or use the published image once #19 provides one. Two places to put it, both throwaway:

- **A small server with a host name and HTTPS** (Caddy, `--profile https`). Closest to real life: the phone reaches it over mobile data, as it would after hours. Recommended.
- **The laptop, on a Wi-Fi network you control** (a phone hotspot or a test router, never the office network). Set `BIND_ADDRESS=0.0.0.0` and `SITE_URL=http://<laptop's address on that network>:8080` in `.env`, so the phone can reach it. This opens the builder to everyone on that network, which is why it must be a private one; the install guide's warning about `BIND_ADDRESS` applies.

Either way `SITE_URL` must be the address the **phone** uses: the admin's "view on site" links go there. Leave "Require two-factor" off; nothing in the tests needs it.

Sign in to `/admin` as the first account (`SUPER_ADMIN_USERNAME`) and choose its new password.

## 2. Test accounts (once)

One account per officer, all made before the seed archive (step 4), because restoring the archive puts accounts back to how they were in it.

1. **Users → Invite someone**, role **Content Manager**, note `Pegawai 1`. Not Editor: an Editor can't publish ([auth.md](../auth.md) § Roles), so tasks A and B would fail by design.
2. Open the invite link in a private window. Full name `Pegawai 1`, username `pegawai1`, a password from your password manager. Use these labels, never the officer's name: the name shows in history, Publishing and the audit log.
3. Still signed in as `pegawai1`: **Settings → Language → Bahasa Melayu → Save**. The admin language belongs to each account, so the officer starts in BM.
4. Sign out. Repeat for `pegawai2` to `pegawai5`.

## 3. Seed Jabatan Contoh (once)

From the checkout, against the running install, signed in as the first account:

```sh
pnpm install
pnpm --filter @laman/blocks --filter @laman/contracts build
read -rs USABILITY_PASS && export USABILITY_PASS     # the first account's password, not echoed
USABILITY_URL=https://<builder address> USABILITY_USER=<first account> \
  pnpm --filter @laman/server exec tsx scripts/usability-site.ts
```

It ends by printing the live hours and what's waiting, and fails if they aren't what this kit expects. Run it on a fresh install; running it twice is harmless.

What it makes (`apps/server/scripts/usability-site.ts`):

| Walkthrough | The state                                                                                                                                                                                                                                                        |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A           | Office hours **8.00 pagi hingga 5.00 petang, Isnin hingga Jumaat** in the site settings (Contact), live. They show on Hubungi kami and in the footer of every page, and nowhere else.                                                                            |
| B           | No announcement, on or waiting. Utama, Perkhidmatan, Hubungi kami and Notis (one entry) are live.                                                                                                                                                                |
| D           | Three things waiting: **Perkhidmatan** has a newer draft (its introduction sentence), the **navigation** has a new Notis link, and **Soalan lazim** is a new page never published. The header says "2 belum diterbitkan"; the Publishing screen lists all three. |

## 4. Save the seeded state (once)

```sh
docker compose exec laman laman backup
docker compose exec laman laman backups                      # note the archive's name
docker compose exec laman sh -c 'cp /backups/<archive> /backups/usability-seed.tar.gz'
docker compose exec laman laman backup --verify usability-seed.tar.gz
```

Copy it to `usability-seed.tar.gz` because the builder prunes its own archives (one per day is kept), and a later backup on the same day deletes the original. A file with any other name is never pruned.

## 5. Reset before every session

The officer's changes from the last session must not be there. With nobody signed in:

```sh
docker compose stop laman
docker compose run --rm --no-deps laman laman restore usability-seed.tar.gz
docker compose start laman
docker compose exec laman sh -c 'rm -r /data/before-restore-*'
```

Wait for `docker compose ps` to say `healthy` (the site is republished as it starts). Then check, in a private window: Hubungi kami says 8.00 to 5.00, there's no announcement bar, and as `pegawaiN` the admin is in BM and the header says "2 belum diterbitkan". Restoring signs everyone out, so sign in afterwards: on the laptop as the officer's account, before they arrive.

## 6. The session (about 45 minutes)

| Minutes | Part                                                  |
| ------- | ----------------------------------------------------- |
| 0–5     | Welcome, consent, language                            |
| 5–12    | Warm-up questions                                     |
| 12–15   | Phone set-up: bookmark and sign-in (timed separately) |
| 15–25   | Task A, on the laptop                                 |
| 25–32   | Task B, on the officer's phone, timed                 |
| 32–38   | Task D, on the laptop                                 |
| 38–45   | Debrief                                               |

Throughout: ask them to think aloud. Don't help, explain or say whether they're right. If they ask, answer "Apa yang anda akan buat jika saya tiada di sini?" / "What would you do if I weren't here?". Give a hint only when they've been stuck for about two minutes or ask twice, and note it: that task is then "needed help".

### Consent (read aloud, before anything is recorded)

> **BM:** Terima kasih kerana datang. Kami sedang menguji laman web, bukan menguji anda; jika sesuatu sukar, itu masalah laman web. Saya akan minta anda membuat tiga tugasan dan bercakap tentang apa yang anda fikirkan. Dengan kebenaran anda, saya akan merakam skrin komputer riba dan telefon anda, tanpa wajah atau suara anda. Nama anda dan nama agensi anda tidak akan ditulis di mana-mana laporan; anda akan dirujuk sebagai "P1" dan seterusnya. Rakaman hanya disimpan oleh pasukan projek dan dipadam selepas dapatan ditulis. Anda boleh berhenti pada bila-bila masa tanpa memberi sebab. Boleh saya mula merakam?
>
> **EN:** Thank you for coming. We're testing the website, not you; if something is hard, that's the website's problem. I'll ask you to do three tasks and to talk about what you're thinking. With your permission I'll record the laptop's screen and your phone's screen, not your face or voice. Your name and your agency's name won't be written in any report; you'll be "P1" and so on. Only the project team keeps the recordings, and they're deleted once the findings are written up. You can stop at any time without giving a reason. May I start recording?

No recording without a clear yes. If they say no to recording, take notes and use the stopwatch. Then ask: "Bahasa Melayu atau English untuk laman pentadbir?" If English, switch the account in Settings → Language before the tasks, and note it.

### Warm-up questions

Listen for the assumptions in [project-context.md](../project-context.md) (§ Users, § What they do today). Note answers in the findings, without names.

1. **BM:** Ceritakan kali terakhir anda mengemas kini laman web agensi anda. Apa yang anda ubah, dan bagaimana? **EN:** Tell me about the last time you updated your agency's website. What did you change, and how?
2. **BM:** Berapa kerap anda membuatnya? Siapa yang menghantar bahan kepada anda, dan dalam bentuk apa? **EN:** How often? Who sends you the content, and in what form? _(Word, PDF, poster, WhatsApp)_
3. **BM:** Siapa yang perlu bersetuju sebelum sesuatu disiarkan? Bagaimana persetujuan itu diberi? **EN:** Who has to agree before something goes public, and how do they agree? _(approval over WhatsApp)_
4. **BM:** Pernahkah anda perlu mengemas kini laman web di luar waktu pejabat atau dari telefon? Apa yang berlaku? **EN:** Have you ever had to update the site after hours or from a phone? What happened?
5. **BM:** Bagaimana anda belajar menggunakan sistem laman web anda sekarang? Siapa yang anda tanya jika tersekat? **EN:** How did you learn the system you use now? Who do you ask when you're stuck? _(handover, rotation, no support)_

### Phone set-up (not part of any task's time)

On the officer's phone, open the builder's `/admin` address and add it as a bookmark or to the home screen. The officer signs in as `pegawaiN` with the password you give them (on a slip of paper you take back). Time the sign-in on its own, from opening the address to the dashboard, and note anything that went wrong. Leave them signed in, then put the phone face down.

### After every task

Ask: **"Adakah perubahan anda sudah boleh dilihat oleh orang ramai sekarang?" / "Is your change live?"** and, if they say yes, "Bagaimana anda tahu?" / "How do you know?". Then check the published site yourself and note whether the answer was right. Also ask: "Adakah apa-apa lagi berubah di laman web tanpa anda sengajakan?" / "Did anything else change on the site that you didn't mean to?", and check the waiting list (the seeded three should still be there).

## 7. Task cards

Print each card on its own, BM on the front and English on the back. The cards describe the officer's situation and never name a screen or a button. The facilitator notes beside each card are for you only.

### Task A: the office hours (laptop)

> **BM:** Waktu pejabat jabatan anda telah berubah. Mulai minggu depan, pejabat dibuka dari 8.30 pagi hingga 4.30 petang, Isnin hingga Jumaat. Kemas kini laman web supaya orang ramai tahu.
>
> **EN:** Your department's office hours have changed. From next week, the office is open from 8.30 am to 4.30 pm, Monday to Friday. Update the website so the public knows.

**The right answer:** the hours live in the site settings, so changing them once changes Hubungi kami and the footer of every page. Settings → Contact (Tetapan → Hubungi), Office hours, Save, then Publish settings (Terbitkan tetapan). Live when Hubungi kami and the footer both say 8.30 to 4.30.

| Rating               | When                                                                                                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pass                 | The new hours are live on Hubungi kami and in the footer, without help and without wrong turns, and they answer "is it live?" correctly.                                                                              |
| Pass with hesitation | Live without help, but after a wrong turn (opening the Hubungi kami page first, the help text under the contact block), a long pause, or saying they're unsure it worked.                                             |
| Needed help          | Live only after a hint.                                                                                                                                                                                               |
| Fail                 | Not live: saved but not published, or they believe it's live when it isn't. Also fail: the hours typed into the contact block's own fields ("instead of the site settings"), so the footer still shows the old hours. |

Note the path they took, and whether their publish also took the seeded changes live (it shouldn't: Publish settings publishes only the settings).

### Task B: the flood closure (the officer's own phone, timed)

> **BM:** Sekarang pukul 9 malam dan anda di rumah. Ketua anda menghantar WhatsApp: pejabat ditutup esok kerana banjir, dan orang ramai boleh berurusan di kaunter cawangan Seksyen 9. Beritahu orang ramai melalui laman web sekarang, menggunakan telefon anda.
>
> **EN:** It's 9 pm and you're at home. Your head of department sends a WhatsApp: the office is closed tomorrow because of floods, and the public can use the counter at the Seksyen 9 branch. Tell the public through the website now, using your phone.

**The right answer:** an announcement on every page. From the dashboard, "Siarkan pengumuman" (or Pengumuman in the menu), switch it on, write the message, Publish announcement (Terbitkan pengumuman). It ends by itself at the end of tomorrow by default, which is right for this case.

| Rating               | When                                                                                                                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pass                 | The announcement shows on the published home page on their phone, says the office is closed tomorrow, without help, and they answer "is it live?" correctly.                            |
| Pass with hesitation | As pass, after a wrong turn (looking under Navigation or Pages first), a long pause, or uncertainty about whether it's live.                                                            |
| Needed help          | Live only after a hint.                                                                                                                                                                 |
| Fail                 | Nothing on the home page by the end: not published, or posted as a Notis entry or a new page only (visitors to the home page wouldn't see it). Also fail at 10 minutes without it live. |

**Timing the announcement.** Comparable across sessions only if every session does exactly this:

- **Device:** the officer's own phone, on the network you'll note in the findings (mobile data, or the test Wi-Fi). Already signed in at set-up; sign-in is excluded from the time.
- **Before the clock:** the officer reads the card and says they're ready. Reading time is excluded.
- **Start:** the moment they tap the admin bookmark.
- **Stop:** the moment the announcement is on screen on the **published site** on that phone. If they stop without opening the site, ask "is it live?"; the clock keeps running until they show it on the site, or say they wouldn't check (then stop at that moment and note it).
- **Included:** everything in between, hints and wrong turns too. Note when each hint was given.
- **How:** with consent, a screen recording of the phone, and read the start and stop from the recording's timeline afterwards. Without consent, the stopwatch, started and stopped on the same events.
- **Cap:** 10 minutes. Stop and record "over 10 minutes".
- **Target:** under 2 minutes.

### Task D: what's waiting (laptop)

> **BM:** Anda baru mengambil alih laman web ini daripada rakan sekerja yang telah bertukar. Sebelum bertukar, dia sedang membuat beberapa perubahan. Ketua unit anda mahu tahu: apakah yang sudah diubah tetapi belum dilihat oleh orang ramai? Beritahu saya apa yang anda jumpa. Jangan ubah apa-apa di laman web dahulu; ketua unit mahu melihat senarai itu dahulu.
>
> **EN:** You've just taken over this website from a colleague who has been transferred. Before leaving, they were making some changes. Your head of unit wants to know: what has been changed but isn't seen by the public yet? Tell me what you find. Don't change anything on the website yet; your head of unit wants to see the list first.

**The expected answer:** three things, as the Publishing screen (Penerbitan → Sedia diterbitkan) lists them:

1. **Perkhidmatan**: changes not live (its introduction now also says "dalam talian atau di kaunter").
2. **Navigasi**: changes not live (a Notis link added to the menu).
3. **Soalan lazim**: a new page, never published.

Plus anything the officer left unpublished in A or B: add it to the expected list for that session. The header's count says 2 because it leaves new pages out; note whether that misleads them.

| Rating               | When                                                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Pass                 | Names all three (what changed in each is a bonus), without help, and publishes nothing.                                                         |
| Pass with hesitation | Names all three after a wrong turn or a long search, or names the two changes and only finds the new page when asked "anything else?".          |
| Needed help          | Finds the list only after a hint.                                                                                                               |
| Fail                 | Says nothing is waiting, gives the wrong list, or misses the two changes. Publishing them is also a fail: the card said not to change anything. |

## 8. Debrief

1. **BM:** Apakah bahagian yang paling sukar hari ini? **EN:** What was the hardest part today?
2. **BM:** Adakah apa-apa yang mengejutkan anda? **EN:** Did anything surprise you?
3. **BM:** Jika anda seorang diri esok, tanpa sesiapa untuk ditanya, adakah anda yakin boleh membuat tugasan ini? Kenapa? **EN:** If you were alone tomorrow with nobody to ask, would you be confident doing these tasks? Why?
4. **BM:** Adakah anda lebih suka laman pentadbir dalam Bahasa Melayu atau English? **EN:** Would you rather use the admin in BM or English?
5. **BM:** Ada apa-apa lagi yang anda mahu beritahu kami? **EN:** Anything else you'd like to tell us?

Thank them. Then, before the next officer: write up the session while it's fresh, and reset (step 5).

## After the sessions

Write the findings up in `docs/usability/findings.md` from the template, with no names and no agency names. Each blocking finding (P0 or P1) becomes an issue, linked from the roll-up. Updating `PRODUCT.md` § Evidence on Hand waits for Irfan's approval.
