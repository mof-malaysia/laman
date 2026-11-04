// Captures the marketing site's product screenshots from a running builder
// seeded with the demo agency (apps/server/scripts/demo-site.ts), through
// headless Chrome's DevTools protocol, into public/shots/ as WebP.
//
//   CHROME=/path/to/chrome DEMO_URL=http://127.0.0.1:3020 DEMO_USER=demo DEMO_PASS=… \
//     node scripts/screenshots.mjs
//
// Needs Chrome or Chromium (CHROME) and cwebp on the PATH. Nothing here runs
// in the published site.
import { spawn, execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const chrome = process.env.CHROME;
const base = process.env.DEMO_URL ?? "http://127.0.0.1:3020";
const out = join(import.meta.dirname, "..", "public", "shots");
if (!chrome || !process.env.DEMO_PASS) throw new Error("Set CHROME and DEMO_PASS.");

/** The demo's pages by address, to open the editor on the right one. */
async function session() {
  const response = await fetch(`${base}/api/auth/sign-in`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: process.env.DEMO_USER ?? "demo",
      password: process.env.DEMO_PASS,
    }),
  });
  if (!response.ok) throw new Error(`Sign-in failed: ${response.status}`);
  const cookie = response.headers.getSetCookie()[0].split(";")[0];
  const pages = (await (await fetch(`${base}/api/pages`, { headers: { cookie } })).json()).data;
  const [name, value] = cookie.split("=");
  return {
    cookie,
    name,
    value,
    idOf: (slug) => pages.find((p) => p.slug === slug)?.id ?? pages[0].id,
  };
}

const profile = await mkdtemp(join(tmpdir(), "laman-shots-"));
const browser = spawn(chrome, [
  "--headless",
  "--remote-debugging-port=0",
  `--user-data-dir=${profile}`,
  "--hide-scrollbars",
  "--force-color-profile=srgb",
]);
const wsUrl = await new Promise((resolve, reject) => {
  browser.stderr.on("data", (chunk) => {
    const match = /DevTools listening on (ws:\S+)/.exec(String(chunk));
    if (match) resolve(match[1]);
  });
  browser.on("exit", () => reject(new Error("Chrome exited before it was ready.")));
});

// The headless shell starts with no tab: open one.
const http = wsUrl.replace("ws://", "http://").replace(/\/devtools\/.*/, "");
const tab = await (await fetch(`${http}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));
let nextId = 0;
const waiting = new Map();
ws.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  if (message.id && waiting.has(message.id)) {
    waiting.get(message.id)(message);
    waiting.delete(message.id);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    waiting.set(id, (m) =>
      m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result),
    );
    ws.send(JSON.stringify({ id, method, params }));
  });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const evaluate = (expression) =>
  send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
/** Waits until `expression` is truthy in the page, up to 15 s. */
async function until(expression) {
  for (let i = 0; i < 60; i++) {
    if ((await evaluate(`Boolean(${expression})`)).result.value) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

/** Clicks the element `expression` finds with real pointer events: FTDS controls ignore a scripted click(). */
async function pointerClick(expression) {
  const { result } = await evaluate(
    `(() => { const el = ${expression}; if (!el) return null; const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`,
  );
  if (!result.value) throw new Error(`Nothing to click: ${expression}`);
  const [x, y] = result.value;
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  for (const type of ["mousePressed", "mouseReleased"])
    await send("Input.dispatchMouseEvent", {
      type,
      x,
      y,
      button: "left",
      buttons: 1,
      clickCount: 1,
    });
  await sleep(300);
  // Headless sometimes drops the click on a Base UI control: fall back to the keyboard.
  const { result: pressed } = await evaluate(`(${expression})?.getAttribute("aria-checked")`);
  if (pressed.value === "false") {
    await evaluate(`(${expression}).focus()`);
    for (const type of ["keyDown", "keyUp"])
      await send("Input.dispatchKeyEvent", {
        type,
        key: " ",
        code: "Space",
        windowsVirtualKeyCode: 32,
        text: type === "keyDown" ? " " : undefined,
      });
  }
}

const { cookie, name, value, idOf } = await session();
/** The admin's language is the signed-in person's: set it before each language's admin shots. */
const setLanguage = (language) =>
  fetch(`${base}/api/preferences`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ language }),
  });
await send("Page.enable");
await send("Emulation.setFocusEmulationEnabled", { enabled: true });
await send("Network.enable");
await send("Network.setCookie", { name, value, url: base, path: "/" });

/** Each shot: where, at what size, what to do first. Admin shots are taken in each language. */
const adminShots = (lang) => [
  {
    file: `editor-${lang}`,
    url: `/admin/pages/${idOf("")}/edit`,
    width: 1440,
    height: 900,
    ready: "document.querySelector('iframe')?.contentDocument?.querySelector('h1')",
  },
  {
    file: `checks-${lang}`,
    // The editor opens its checks before publishing from the address.
    url: `/admin/pages/${idOf("notis-banjir")}/edit?checks=true`,
    width: 1440,
    height: 900,
    ready:
      "document.querySelector('.z-modal') && document.querySelector('iframe')?.contentDocument?.querySelector('main')",
  },
  {
    file: `publishing-${lang}`,
    url: "/admin/publishing",
    width: 1440,
    height: 900,
    ready:
      "document.querySelector('main h1') && document.querySelector('main input[type=checkbox]:not(:disabled)')",
    // Tick the publishable change, so the screen shows a publish ready to go.
    act: () =>
      pointerClick(
        `[...document.querySelectorAll("main input[type=checkbox]")].find((box) => box.labels?.[0]?.textContent.includes("Hubungi kami"))?.parentElement.querySelector("[role=checkbox]")`,
      ),
  },
];
const shots = [
  { language: "ms", shots: adminShots("ms") },
  { language: "en", shots: adminShots("en") },
  {
    shots: [
      {
        file: "site",
        url: "/",
        width: 1280,
        height: 800,
        ready: "document.querySelector('main h1')",
      },
      {
        file: "site-phone",
        url: "/",
        width: 390,
        height: 844,
        mobile: true,
        ready: "document.querySelector('main h1')",
      },
    ],
  },
];

await mkdir(out, { recursive: true });
try {
  for (const group of shots) {
    if (group.language) await setLanguage(group.language);
    for (const shot of group.shots) {
      await send("Emulation.setDeviceMetricsOverride", {
        width: shot.width,
        height: shot.height,
        deviceScaleFactor: 2,
        mobile: Boolean(shot.mobile),
      });
      await send("Page.navigate", { url: base + shot.url });
      await until(`document.readyState === "complete" && ${shot.ready}`);
      await evaluate("document.fonts.ready.then(() => true)");
      await shot.act?.();
      await sleep(600);
      const { data } = await send("Page.captureScreenshot", { format: "png" });
      const png = join(profile, `${shot.file}.png`);
      await writeFile(png, Buffer.from(data, "base64"));
      execFileSync("cwebp", ["-quiet", "-q", "86", png, "-o", join(out, `${shot.file}.webp`)]);
      // A 1200px copy too, for phones (the pages' srcset); a phone shot is already small.
      if (!shot.mobile)
        execFileSync("cwebp", [
          "-quiet",
          "-q",
          "82",
          "-resize",
          "1200",
          "0",
          png,
          "-o",
          join(out, `${shot.file}-1200.webp`),
        ]);
      console.log(`  ${shot.file}.webp`);
    }
  }
} finally {
  await setLanguage("en");
  ws.close();
  browser.kill();
  await rm(profile, { recursive: true, force: true });
}
