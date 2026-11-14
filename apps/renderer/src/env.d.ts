/// <reference types="astro/client" />
import type { RenderInput } from "@laman/blocks";

declare global {
  namespace App {
    interface Locals {
      /** Set by the server for every render; see entry.d.ts. */
      render?: RenderInput;
    }
  }
}
