// Installs FTDS registry items into the renderer: `node scripts/ftds-add.mjs astro-hero …`.
//
// The shadcn CLI can't install .astro files yet (it parses them as JavaScript),
// so this does what it does for us: resolve registryDependencies, then write
// every file to its target exactly as the registry ships it. Styles go under
// styles/, everything else under src/, where the shadcn CLI would put them. npm
// dependencies are printed, to add to the catalog by hand.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const root = join(import.meta.dirname, "..");
const { registries } = JSON.parse(await readFile(join(root, "components.json"), "utf8"));
const itemUrl = (name) => registries["@ftds"].replace("{name}", name);

const seen = new Set();
const npm = new Set();

async function add(url) {
  if (seen.has(url)) return;
  seen.add(url);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  const item = await response.json();
  for (const dependency of item.registryDependencies ?? []) {
    await add(dependency.startsWith("http") ? dependency : itemUrl(dependency));
  }
  for (const dependency of item.dependencies ?? []) npm.add(dependency);
  for (const file of item.files ?? []) {
    // "~/" is the project root; shadcn puts the rest under the src alias.
    const target = (file.target ?? file.path).replace(/^~\//, "");
    const path = target.startsWith("styles/") ? join(root, target) : join(root, "src", target);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, file.content);
    console.log(`  ${item.name}: ${path.slice(root.length + 1)}`);
  }
}

for (const name of process.argv.slice(2)) await add(itemUrl(name));
if (npm.size) console.log(`npm dependencies: ${[...npm].join(" ")}`);
