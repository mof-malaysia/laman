// Where the built renderer keeps its browser assets (CSS, fonts, scripts).
import { fileURLToPath } from "node:url";

export const clientDir = fileURLToPath(new URL("./dist/client/", import.meta.url));
