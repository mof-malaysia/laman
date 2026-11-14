/**
 * Add block: a searchable list of the blocks this page can hold, opened from
 * the canvas's "Add block" line or under Layers, so the Layers list stays in view.
 */
import type { BlockType } from "@laman/blocks";
import { useState } from "react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import { BlockChoices, blockChoices } from "./layers";

export function BlockPicker({
  open,
  allowed,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  allowed: readonly BlockType[];
  onOpenChange: (open: boolean) => void;
  onPick: (type: BlockType) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <Picker allowed={allowed} onPick={onPick} />}
    </Dialog>
  );
}

function Picker({
  allowed,
  onPick,
}: {
  allowed: readonly BlockType[];
  onPick: (type: BlockType) => void;
}) {
  const [query, setQuery] = useState("");
  return (
    <DialogBody className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{t("editor.picker.title")}</DialogTitle>
      </DialogHeader>
      <DialogContent className="flex flex-col gap-3">
        <Input
          type="search"
          // The picker is for choosing: typing starts at once.
          // oxlint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Enter takes the first match.
            const first = blockChoices(allowed, query)[0];
            if (e.key === "Enter" && first) {
              e.preventDefault();
              onPick(first.type);
            }
          }}
          placeholder={t("editor.picker.search")}
          aria-label={t("editor.picker.search")}
        />
        <div className="-mx-1 max-h-[60vh] overflow-y-auto px-1 pb-1">
          <BlockChoices allowed={allowed} query={query} onPick={onPick} />
        </div>
      </DialogContent>
    </DialogBody>
  );
}
