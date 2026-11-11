import { InputAddon } from "@/components/ui/input";

/**
 * Where the address sits: the nearest parent's part of it, with "../" when there are
 * more above. The whole parent address is in its tooltip.
 */
export function ParentPrefix({ path }: { path: string }) {
  const above = path.split("/").filter(Boolean).slice(0, -1);
  const parent = above.at(-1);
  const prefix = parent ? `${above.length > 1 ? "../" : "/"}${parent}/` : "/";
  return (
    <InputAddon
      title={`/${above.map((part) => `${part}/`).join("")}`}
      className="bg-bg-washed text-txt-black-500 max-w-1/2 shrink-0 rounded-l-md"
    >
      <span className="truncate">{prefix}</span>
    </InputAddon>
  );
}
