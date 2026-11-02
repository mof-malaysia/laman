import { useNavigate } from "@tanstack/react-router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { t } from "@/i18n";
import { usePages } from "@/lib/pages";

/** Every page by title and path; choosing one opens it in the editor. */
export function OpenPageDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const pages = usePages();
  const navigate = useNavigate();
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title={t("openPage.title")}>
      <CommandInput placeholder={t("openPage.placeholder")} />
      <CommandList>
        <CommandEmpty>{t("openPage.empty")}</CommandEmpty>
        <CommandGroup heading={t("openPage.group")}>
          {pages.data?.map((page) => (
            <CommandItem
              key={page.id}
              value={`${page.title} ${page.path} ${page.id}`}
              onSelect={() => {
                onOpenChange(false);
                void navigate({ to: "/pages/$id/edit", params: { id: page.id } });
              }}
            >
              <span className="truncate">{page.title || t("page.untitled")}</span>
              <span className="text-txt-black-700 ml-auto truncate">{page.path}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
