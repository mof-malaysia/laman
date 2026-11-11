/**
 * What happens to the page as a whole, from least to most destructive:
 * redirect, duplicate, move, unpublish, delete. The home page only duplicates.
 * A collection's own settings come first.
 */
import type { PageRedirect, RedirectStatus } from "@fiscal-sb/blocks";
import type { DeletePreview, Page, PageSummary } from "@fiscal-sb/contracts";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { PagePicker } from "@/components/page-picker";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldItem, FieldLabel } from "@/components/ui/field";
import { Fieldset, FieldsetLegend } from "@/components/ui/fieldset";
import { Input } from "@/components/ui/input";
import { Radio, RadioButton, RadioItem, RadioLabel } from "@/components/ui/radio";
import { Spinner } from "@/components/ui/spinner";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup } from "@/components/ui/toggle-group";
import { type MessageKey, t } from "@/i18n";
import { apiError, listingApi, pagesApi } from "@/lib/api";
import { useCan } from "@/lib/auth";
import { useFailure } from "@/lib/use-failure";
import useToast from "@/lib/ftds/hooks/use-toast";
import { isHome, subtreeIds, useRefreshPages } from "@/lib/pages";
import { CalendarSources, SyncNowButton } from "./calendar-sources";
import { CollectionSettings } from "./listing";
import { PathChanges } from "./move";
import type { SettingsSection } from "./search";
import { tabCard } from "./tab-layout";
import { UndoDelete } from "./trash-screen";
import { useSaveDraft } from "./use-save-draft";
import { scrollToTop } from "@/lib/scroll";

/** One row of the Settings list: what it does on the left, its action on the right, any options under both. */
function Section({
  id,
  focus,
  danger,
  action,
  children,
}: {
  id: SettingsSection;
  focus: boolean;
  danger?: boolean;
  action?: ReactNode;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!focus) return;
    const frame = requestAnimationFrame(() => scrollToTop(ref.current));
    return () => cancelAnimationFrame(frame);
  }, [focus]);
  return (
    <section
      ref={ref}
      id={`settings-${id}`}
      aria-labelledby={`settings-${id}-title`}
      className="flex scroll-mt-4 flex-col gap-3 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-72 flex-col gap-0.5">
          {/* Semibold, a step above the medium-weight field labels under it. */}
          <h3
            id={`settings-${id}-title`}
            className={`text-content font-semibold ${danger ? "text-txt-danger" : "text-txt-black-900"}`}
          >
            {t(`settings.${id}.title`)}
          </h3>
          {/* The collection's rows say it all; every other section has a line. */}
          {id !== "collection" && (
            <p className="text-content text-txt-black-700">{t(`settings.${id}.description`)}</p>
          )}
        </div>
        {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** A bordered list of Settings rows. */
const SectionList = ({ danger, children }: { danger?: boolean; children: ReactNode }) => (
  <div
    className={`${tabCard} flex flex-col divide-y ${danger ? "border-otl-danger-200 divide-otl-danger-200" : "border-otl-gray-200 divide-otl-gray-200"}`}
  >
    {children}
  </div>
);

const Note = ({ message }: { message: MessageKey }) => (
  <p className="text-content text-txt-black-700">{t(message)}</p>
);

/**
 * Settings open inside the editor share the draft the editor is saving: the redirect is
 * part of it, and making a listing or unpublishing changes it on the server. So there
 * the redirect goes through the editor's own draft, and those two actions save the
 * editor's edits first and reload its page after, instead of racing its autosave.
 */
export type DraftLink = {
  redirect: PageRedirect | null;
  setRedirect: (redirect: PageRedirect | null) => void;
  beforeChange: () => Promise<unknown>;
  afterChange: () => Promise<unknown>;
};

export function SettingsTab({
  page,
  pages,
  section,
  draft,
}: {
  page: Page;
  pages: PageSummary[];
  section: SettingsSection | undefined;
  /** In the editor: its draft (see `DraftLink`). */
  draft?: DraftLink | undefined;
}) {
  const home = isHome(page);
  const row = (id: SettingsSection) => ({ id, focus: section === id });
  // The home page can't do these: its row says why in place of the form.
  const homeOr = (id: "redirect" | "move" | "unpublish" | "delete", form: ReactNode) =>
    home ? (
      <Section {...row(id)} danger={id === "delete"}>
        <Note message={`settings.home.${id}`} />
      </Section>
    ) : (
      form
    );
  // Moving, unpublishing and deleting a page on the site change it at once: a Content Manager's call.
  const canPublish = useCan("content.publish");
  const liveOr = (id: "move" | "unpublish" | "delete", form: ReactNode) =>
    homeOr(
      id,
      !canPublish && page.status !== "draft" ? (
        <Section {...row(id)} danger={id === "delete"}>
          <Note message="settings.byManager" />
        </Section>
      ) : (
        form
      ),
    );
  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <SectionList>
        {page.kind === "listing" && (
          <Section {...row("collection")}>
            <CollectionSettings listing={page} />
          </Section>
        )}
        {page.kind === "listing" && canPublish && (
          <Section {...row("calendars")} action={<SyncNowButton listing={page} />}>
            <CalendarSources listing={page} />
          </Section>
        )}
        {homeOr(
          "redirect",
          <RedirectForm
            key={page.updatedAt}
            row={row("redirect")}
            page={page}
            pages={pages}
            draft={draft}
          />,
        )}
        {page.kind === "page" && !home && (
          <MakeListing row={row("listing")} page={page} pages={pages} draft={draft} />
        )}
        <DuplicateForm row={row("duplicate")} page={page} pages={pages} />
        {/* An entry stays in its collection, so it has nothing to move. */}
        {page.kind !== "entry" &&
          liveOr("move", <MoveForm key={page.path} row={row("move")} page={page} pages={pages} />)}
      </SectionList>
      <section aria-labelledby="settings-danger" className="flex flex-col gap-2">
        <h2 id="settings-danger" className="text-label-sm text-txt-danger font-medium">
          {t("settings.danger")}
        </h2>
        <SectionList danger>
          {liveOr(
            "unpublish",
            <UnpublishForm row={row("unpublish")} page={page} pages={pages} draft={draft} />,
          )}
          {liveOr("delete", <DeleteAction row={row("delete")} page={page} pages={pages} />)}
        </SectionList>
      </section>
    </div>
  );
}

type Row = { id: SettingsSection; focus: boolean };

type RedirectMode = "off" | "page" | "url";

function RedirectForm({
  row,
  page,
  pages,
  draft,
}: {
  row: Row;
  page: Page;
  pages: PageSummary[];
  draft: DraftLink | undefined;
}) {
  const save = useSaveDraft(page);
  const { toast } = useToast();
  const current = (draft ? draft.redirect : page.draft.redirect) ?? null;
  const [mode, setMode] = useState<RedirectMode>(current?.to ?? "off");
  const [target, setTarget] = useState<string | null>(
    current?.to === "page" ? current.pageId : null,
  );
  const [url, setUrl] = useState(current?.to === "url" ? current.url : "https://");
  const [status, setStatus] = useState<RedirectStatus>(current?.status ?? 301);
  const [error, setError] = useState<string>();
  // Not itself, and not a page that redirects: redirects go one step.
  const exclude = useMemo(
    () => new Set(pages.filter((p) => p.id === page.id || p.redirect).map((p) => p.id)),
    [pages, page.id],
  );

  const submit = async () => {
    setError(undefined);
    let redirect: PageRedirect | null = null;
    if (mode === "page") {
      if (!target) return setError(t("settings.redirect.pageRequired"));
      redirect = { to: "page", pageId: target, status };
    } else if (mode === "url") {
      if (!/^https:\/\/[^/\s]+\.[^\s]+$/.test(url.trim()))
        return setError(t("settings.redirect.urlInvalid"));
      redirect = { to: "url", url: url.trim(), status };
    }
    try {
      // In the editor, its autosave saves it with the rest of the draft.
      if (draft) draft.setRedirect(redirect);
      else await save.mutateAsync((doc) => ({ ...doc, redirect }));
      toast({
        variant: "success",
        title: redirect ? t("settings.redirect.saved") : t("settings.redirect.off"),
        description: t("settings.whenLive"),
      });
    } catch (caught) {
      setError((await apiError(caught))?.message ?? t("common.tryAgain"));
    }
  };

  const toggle = (
    <ToggleGroup
      value={[mode]}
      onValueChange={(value) => value[0] && setMode(value[0] as RedirectMode)}
      aria-label={t("settings.redirect.title")}
    >
      <Toggle value="off">{t("settings.redirect.modeOff")}</Toggle>
      <Toggle value="page">{t("settings.redirect.modePage")}</Toggle>
      <Toggle value="url">{t("settings.redirect.modeUrl")}</Toggle>
    </ToggleGroup>
  );

  return (
    <Section {...row} action={toggle}>
      {(mode !== "off" || current) && (
        <form
          noValidate
          className="flex max-w-xl flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {mode === "page" && (
            <Field name="redirect-page" invalid={Boolean(error)}>
              <FieldLabel>{t("settings.redirect.pageLabel")}</FieldLabel>
              <PagePicker
                pages={pages}
                value={target}
                onValueChange={setTarget}
                exclude={exclude}
              />
              <FieldError>{error}</FieldError>
            </Field>
          )}
          {mode === "url" && (
            <Field name="redirect-url" invalid={Boolean(error)}>
              <FieldLabel>{t("settings.redirect.urlLabel")}</FieldLabel>
              <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} />
              <FieldError>{error}</FieldError>
            </Field>
          )}
          {mode !== "off" && (
            <Field name="redirect-status">
              <Fieldset
                render={
                  <Radio
                    value={String(status)}
                    onValueChange={(v) => setStatus(Number(v) as RedirectStatus)}
                  />
                }
              >
                {/* A field label, like the others: FTDS's default legend is a section heading. */}
                <FieldsetLegend className="text-label-md font-medium">
                  {t("settings.redirect.kind")}
                </FieldsetLegend>
                {(
                  [
                    [301, "settings.redirect.permanent"],
                    [302, "settings.redirect.temporary"],
                  ] as const
                ).map(([value, label]) => (
                  <FieldItem key={value}>
                    <RadioItem>
                      <RadioButton value={String(value)} id={`redirect-${value}`} />
                      <RadioLabel htmlFor={`redirect-${value}`}>{t(label)}</RadioLabel>
                    </RadioItem>
                  </FieldItem>
                ))}
              </Fieldset>
            </Field>
          )}
          {mode === "off" && error && <p className="text-content text-txt-danger">{error}</p>}
          <div>
            <Button type="submit" variant="default-outline" disabled={save.isPending}>
              {t("settings.redirect.save")}
            </Button>
          </div>
        </form>
      )}
    </Section>
  );
}

function MakeListing({
  row,
  page,
  pages,
  draft,
}: {
  row: Row;
  page: Page;
  pages: PageSummary[];
  draft: DraftLink | undefined;
}) {
  const refresh = useRefreshPages();
  const fail = useFailure();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  if (pages.some((p) => p.parentId === page.id))
    return (
      <Section {...row}>
        <Note message="settings.listing.children" />
      </Section>
    );
  const make = async () => {
    setBusy(true);
    try {
      await draft?.beforeChange();
      await listingApi.make(page.id);
      await refresh(page.id);
      await draft?.afterChange();
      toast({ variant: "success", title: t("settings.listing.done") });
    } catch (error) {
      await fail(t("settings.listing.failed"), error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section
      {...row}
      action={
        <Button variant="default-outline" disabled={busy} onClick={() => void make()}>
          {t("settings.listing.action")}
        </Button>
      }
    />
  );
}

function DuplicateForm({ row, page, pages }: { row: Row; page: Page; pages: PageSummary[] }) {
  const navigate = useNavigate();
  const refresh = useRefreshPages();
  const fail = useFailure();
  const { toast } = useToast();
  const [withChildren, setWithChildren] = useState(false);
  const [busy, setBusy] = useState(false);
  const descendants = subtreeIds(pages, page.id).size - 1;

  const duplicate = async () => {
    setBusy(true);
    try {
      const copy = await pagesApi.duplicate(page.id, { includeChildren: withChildren });
      await refresh();
      toast({ variant: "success", title: t("settings.duplicate.done", { title: copy.title }) });
      // The copy, ready to edit.
      await navigate({ to: "/pages/$id/edit", params: { id: copy.id } });
    } catch (error) {
      await fail(t("settings.duplicate.failed"), error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      {...row}
      action={
        <Button variant="default-outline" disabled={busy} onClick={() => void duplicate()}>
          {t("settings.duplicate.action")}
        </Button>
      }
    >
      {descendants > 0 && (
        <Field name="include-children">
          <FieldItem>
            <Checkbox checked={withChildren} onCheckedChange={setWithChildren} />
            <FieldLabel>
              {page.kind === "listing"
                ? t("settings.duplicate.entries", { count: descendants })
                : t("settings.duplicate.children", { count: descendants })}
            </FieldLabel>
          </FieldItem>
        </Field>
      )}
    </Section>
  );
}

function MoveForm({ row, page, pages }: { row: Row; page: Page; pages: PageSummary[] }) {
  const refresh = useRefreshPages();
  const fail = useFailure();
  const { toast } = useToast();
  const [parent, setParent] = useState<string | null>(page.parentId);
  const [redirect, setRedirect] = useState(page.status !== "draft");
  const [busy, setBusy] = useState(false);
  const exclude = useMemo(() => subtreeIds(pages, page.id), [pages, page.id]);
  const changed = parent !== null && parent !== page.parentId;
  const preview = useQuery({
    queryKey: ["move-preview", page.id, "parent", parent],
    queryFn: () => pagesApi.move(page.id, { parentId: parent ?? undefined, dryRun: true }),
    enabled: changed,
    retry: false,
  });
  const changes = changed ? (preview.data?.changes ?? []) : [];

  const move = async () => {
    if (!parent) return;
    setBusy(true);
    try {
      await pagesApi.move(page.id, {
        parentId: parent,
        redirect: changes.some((c) => c.published) && redirect,
      });
      await refresh(page.id);
      toast({
        variant: "success",
        title: t("settings.move.done"),
      });
    } catch (error) {
      await fail(t("move.failed"), error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section {...row}>
      <div className="flex max-w-xl flex-wrap items-end gap-2">
        <Field name="move-parent" className="w-auto min-w-60 flex-1">
          <FieldLabel>{t("settings.move.parent")}</FieldLabel>
          <PagePicker pages={pages} value={parent} onValueChange={setParent} exclude={exclude} />
        </Field>
        <Button
          variant="default-outline"
          disabled={!changed || busy || preview.isError}
          onClick={() => void move()}
        >
          {t("settings.move.action")}
        </Button>
      </div>
      {preview.isError && (
        <p className="text-content text-txt-danger">{t("settings.move.cantGo")}</p>
      )}
      {changes.length > 0 && (
        <>
          <p className="text-content">
            {t("detail.details.pathsChange", { count: changes.length })}
          </p>
          <PathChanges changes={changes} />
          {changes.some((c) => c.published) && (
            <Field name="move-redirect">
              <FieldItem>
                <Checkbox checked={redirect} onCheckedChange={setRedirect} />
                <FieldLabel>{t("move.redirect")}</FieldLabel>
              </FieldItem>
            </Field>
          )}
        </>
      )}
    </Section>
  );
}

function UnpublishForm({
  row,
  page,
  pages,
  draft,
}: {
  row: Row;
  page: Page;
  pages: PageSummary[];
  draft: DraftLink | undefined;
}) {
  const refresh = useRefreshPages();
  const fail = useFailure();
  const { toast } = useToast();
  const [redirect, setRedirect] = useState(true);
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const exclude = useMemo(() => new Set([page.id]), [page.id]);
  if (page.status === "draft")
    return (
      <Section {...row}>
        <Note message="settings.unpublish.notPublished" />
      </Section>
    );

  const unpublish = async () => {
    setBusy(true);
    try {
      await draft?.beforeChange();
      await pagesApi.unpublish(page.id, redirect && target ? { redirectTo: target } : {});
      await refresh(page.id);
      await draft?.afterChange();
      toast({
        variant: "success",
        title: t("settings.unpublish.done"),
      });
    } catch (error) {
      await fail(t("settings.unpublish.failed"), error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      {...row}
      action={
        <Button
          variant="default-outline"
          disabled={busy || (redirect && !target)}
          onClick={() => void unpublish()}
        >
          {t("settings.unpublish.action")}
        </Button>
      }
    >
      <Field name="unpublish-redirect">
        <FieldItem>
          <Checkbox checked={redirect} onCheckedChange={setRedirect} />
          <FieldLabel>{t("settings.unpublish.redirect")}</FieldLabel>
        </FieldItem>
      </Field>
      {redirect && (
        <Field name="unpublish-target" className="max-w-xl">
          <FieldLabel>{t("settings.unpublish.target")}</FieldLabel>
          <PagePicker pages={pages} value={target} onValueChange={setTarget} exclude={exclude} />
        </Field>
      )}
    </Section>
  );
}

function DeleteAction({ row, page, pages }: { row: Row; page: Page; pages: PageSummary[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Section
      {...row}
      danger
      action={
        <Button variant="danger-fill" onClick={() => setOpen(true)}>
          {t("settings.delete.action")}
        </Button>
      }
    >
      <AlertDialog variant="danger" open={open} onOpenChange={setOpen}>
        {open && <DeleteDialogContent page={page} pages={pages} onClose={() => setOpen(false)} />}
      </AlertDialog>
    </Section>
  );
}

function DeleteDialogContent({
  page,
  pages,
  onClose,
}: {
  page: Page;
  pages: PageSummary[];
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const refresh = useRefreshPages();
  const fail = useFailure();
  const { toast } = useToast();
  const preview = useQuery({
    queryKey: ["delete-preview", page.id],
    queryFn: () => pagesApi.deletePreview(page.id),
    staleTime: 0,
  });
  const [children, setChildren] = useState<"delete" | "lift" | null>(
    // A listing's entries always go with it.
    page.kind === "listing" ? "delete" : null,
  );
  const [redirect, setRedirect] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const data: DeletePreview | undefined = preview.data;
  const count = data?.descendants.length ?? 0;
  const leaving = useMemo(
    () => (children === "lift" ? new Set([page.id]) : subtreeIds(pages, page.id)),
    [children, pages, page.id],
  );
  const ready = data && (count === 0 || children !== null) && (!redirect || target);

  const remove = async () => {
    setBusy(true);
    try {
      await pagesApi.delete(page.id, {
        ...(count > 0 && children ? { children } : {}),
        ...(redirect && target ? { redirectTo: target } : {}),
      });
      await refresh();
      onClose();
      toast({
        variant: "success",
        title: t("delete.done", { title: page.title }),
        description: <UndoDelete id={page.id} />,
      });
      // Back to every page: the one deleted is gone from the list, and Undo is in the toast.
      await navigate({ to: "/pages" });
    } catch (error) {
      await fail(t("delete.failed"), error);
    } finally {
      setBusy(false);
    }
  };

  const confirmLabel =
    count > 0 && page.kind === "listing"
      ? t("delete.confirmWithEntries", { title: page.title, count })
      : count > 0 && children === "delete"
        ? t("delete.confirmWithChildren", { title: page.title, count })
        : t("delete.confirm", { title: page.title });

  return (
    <AlertDialogContent dismissible={!busy} className="sm:w-lg">
      <AlertDialogTitle>{t("delete.title", { title: page.title })}</AlertDialogTitle>
      <AlertDialogDescription>{t("delete.body")}</AlertDialogDescription>
      {!data ? (
        <output className="flex items-center gap-2">
          <Spinner /> {t("delete.checking")}
        </output>
      ) : (
        <div className="flex flex-col gap-4 text-left">
          {count > 0 && page.kind === "listing" && (
            <p className="text-body-sm">{t("delete.entries", { count })}</p>
          )}
          {count > 0 && page.kind !== "listing" && (
            <Field name="delete-children">
              <Fieldset
                render={
                  <Radio
                    value={children ?? ""}
                    onValueChange={(v) => setChildren(v as "delete" | "lift")}
                  />
                }
              >
                <FieldsetLegend className="text-label-md font-medium">
                  {t("delete.children.legend", { count })}
                </FieldsetLegend>
                <FieldItem>
                  <RadioItem>
                    <RadioButton value="delete" id="delete-children-delete" />
                    <RadioLabel htmlFor="delete-children-delete">
                      {t("delete.children.delete", { count })}
                    </RadioLabel>
                  </RadioItem>
                </FieldItem>
                <FieldItem>
                  <RadioItem>
                    <RadioButton value="lift" id="delete-children-lift" />
                    <RadioLabel htmlFor="delete-children-lift">
                      {t("delete.children.lift")}
                    </RadioLabel>
                  </RadioItem>
                </FieldItem>
              </Fieldset>
            </Field>
          )}
          {data.published && (
            <div className="flex flex-col gap-3">
              <p className="text-body-sm">{t("delete.published")}</p>
              <Field name="delete-redirect">
                <FieldItem>
                  <Checkbox checked={redirect} onCheckedChange={setRedirect} />
                  <FieldLabel>{t("delete.redirect")}</FieldLabel>
                </FieldItem>
              </Field>
              {redirect && (
                <Field name="delete-target">
                  <FieldLabel>{t("settings.unpublish.target")}</FieldLabel>
                  <PagePicker
                    pages={pages}
                    value={target}
                    onValueChange={setTarget}
                    exclude={leaving}
                  />
                </Field>
              )}
            </div>
          )}
          {(data.linkedFrom.length > 0 || data.inNavbar) && (
            <div className="flex flex-col gap-1">
              <p className="text-body-sm font-medium">{t("delete.links")}</p>
              <ul className="text-body-sm text-txt-black-700 m-0 list-disc pl-5">
                {data.inNavbar && <li>{t("delete.inNavbar")}</li>}
                {data.linkedFrom.map((ref) => (
                  <li key={ref.id}>
                    {t("delete.linkedFrom", { title: ref.title, path: ref.path })}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <AlertDialogAction>
        <AlertDialogClose render={<Button variant="default-outline" disabled={busy} />}>
          {t("delete.keep")}
        </AlertDialogClose>
        <Button variant="danger-fill" disabled={!ready || busy} onClick={() => void remove()}>
          {confirmLabel}
        </Button>
      </AlertDialogAction>
    </AlertDialogContent>
  );
}
