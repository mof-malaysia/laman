/**
 * API tokens (docs/auth.md § API tokens): keys for programs that write with
 * no one signed in, such as a nightly import. An Admin comes here to make
 * one (name, role, listings, how long), copy its secret once, see which are
 * in use, and revoke one. A revoked token leaves the list (the audit log
 * keeps it); an expired one stays, greyed, until it's revoked.
 */
import {
  API_TOKEN_MAX_DAYS,
  API_TOKEN_NAME_MAX,
  type ApiToken,
  ApiTokenArea,
  type ApiTokenCreated,
  ApiTokenRole,
} from "@fiscal-sb/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { OnceDialog } from "@/components/once-dialog";
import { StatusDot } from "@/components/page-status";
import { Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { Callout, CalloutAction, CalloutTitle } from "@/components/ui/callout";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldItem, FieldLabel } from "@/components/ui/field";
import { Fieldset, FieldsetLegend } from "@/components/ui/fieldset";
import { Input } from "@/components/ui/input";
import {
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateIcon,
  EmptyStateTitle,
} from "@/components/ui/empty-state";
import { LockIcon } from "@/components/ui/icons/lock";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listOf, t } from "@/i18n";
import { roleLabels, tokensApi, tokensQuery } from "@/lib/auth";
import { clx } from "@/lib/ftds/utils";
import { formatDateTime, pagesQuery } from "@/lib/pages";
import { toggleIn } from "@/lib/sets";
import { useAction } from "@/lib/use-action";
import { useRun } from "@/lib/use-run";
import { ago, sub } from "./person";
import { RolePicker } from "./users-screen";
import { UsersHeader } from "./users-tabs";

/** How long a new token lasts: a year by default, since a sync runs unattended; "never" until revoked. */
const DAYS = [30, 90, 180, API_TOKEN_MAX_DAYS] as const;
const NEVER = "never";

export function TokensScreen() {
  const tokens = useQuery(tokensQuery);
  const [making, setMaking] = useState(false);
  const [made, setMade] = useState<ApiTokenCreated>();
  // Revoked ones are gone; live ones first, expired ones below.
  const sorted = tokens.data
    ?.filter((token) => token.status !== "revoked")
    .toSorted((a, b) => Number(a.status !== "live") - Number(b.status !== "live"));

  return (
    <Screen>
      <UsersHeader
        description={t("tokens.intro")}
        actions={
          <Button variant="primary-fill" size="small" onClick={() => setMaking(true)}>
            {t("tokens.make")}
          </Button>
        }
      />

      {tokens.isError ? (
        <Callout variant="danger">
          <CalloutTitle>{t("tokens.loadFailed")}</CalloutTitle>
          <CalloutAction>
            <Button variant="default-outline" size="small" onClick={() => void tokens.refetch()}>
              {t("media.retry")}
            </Button>
          </CalloutAction>
        </Callout>
      ) : !sorted ? (
        <Skeleton className="h-24 w-full rounded-lg" />
      ) : sorted.length === 0 ? (
        <EmptyState className="border-otl-gray-200 rounded-lg border border-dashed py-12">
          <EmptyStateIcon>
            <LockIcon />
          </EmptyStateIcon>
          <EmptyStateTitle as="h2">{t("tokens.empty")}</EmptyStateTitle>
          <EmptyStateDescription className="max-w-lg">
            {t("tokens.empty.body")}
          </EmptyStateDescription>
          <EmptyStateActions>
            <Button
              variant="default-outline"
              size="small"
              // oxlint-disable-next-line jsx-a11y/control-has-associated-label -- labelled by the Button's children
              render={<a href="/docs" target="_blank" rel="noopener" />}
            >
              {t("tokens.empty.docs")}
              <span className="sr-only"> {t("publish.newTab")}</span>
            </Button>
          </EmptyStateActions>
        </EmptyState>
      ) : (
        <Table>
          <TableHeader className="[&_th]:whitespace-nowrap">
            <TableRow>
              <TableHead>{t("tokens.column.name")}</TableHead>
              <TableHead>{t("tokens.column.changes")}</TableHead>
              <TableHead>{t("tokens.column.lastUsed")}</TableHead>
              <TableHead>{t("tokens.column.ends")}</TableHead>
              <TableHead>
                <span className="sr-only">{t("tokens.revoke")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((token) => (
              <TokenRow key={token.id} token={token} />
            ))}
          </TableBody>
        </Table>
      )}

      {making && (
        <MakeDialog
          onClose={() => setMaking(false)}
          onMade={(created) => {
            setMaking(false);
            setMade(created);
          }}
        />
      )}
      {made && (
        <OnceDialog
          title={t("tokens.secret.title", { name: made.token.name })}
          description={t("tokens.secret.body")}
          value={made.secret}
          expires={
            made.token.expiresAt
              ? t("tokens.secret.expires", { when: formatDateTime(made.token.expiresAt) })
              : t("tokens.secret.expiresNever")
          }
          words={{
            label: t("tokens.secret.label"),
            copy: t("tokens.secret.copy"),
            copied: t("tokens.secret.copied"),
            copyFailed: t("tokens.secret.copyFailed"),
            onceTitle: t("tokens.secret.once.title"),
            onceBody: t("tokens.secret.once.body"),
            leaveTitle: t("tokens.secret.leave.title"),
            leaveBody: t("tokens.secret.leave.body"),
          }}
          mono
          onClose={() => setMade(undefined)}
        />
      )}
    </Screen>
  );
}

/** "Entries in Direktori Staf, Media": what a token may change, as the list says it. */
const changesOf = (token: ApiToken) =>
  token.areas
    .map((area) =>
      area === "entries"
        ? t("tokens.area.entriesIn", {
            listings: listOf(
              token.listings.map((listing) => listing.title || t("tokens.untitled")),
            ),
          })
        : t(`tokens.area.${area}`),
    )
    .join(" · ");

function TokenRow({ token }: { token: ApiToken }) {
  const run = useRun(tokensQuery.queryKey);
  const [confirming, setConfirming] = useState(false);
  const live = token.status === "live";
  const name = { name: token.name };

  return (
    <TableRow className={live ? undefined : "text-txt-black-500"}>
      <TableCell>
        <span className="flex items-center gap-2.5">
          <StatusDot tone={live ? "success" : "neutral"} className="size-2" />
          <span className={clx("font-medium", live && "text-txt-black-900")}>{token.name}</span>
        </span>
        {/* Its role, and the token's opening characters to match the one a program holds. */}
        <span className={clx(sub, "whitespace-nowrap pl-[18px]")}>
          {t(roleLabels[token.role])} · <span className="font-mono">{token.hint}…</span>
        </span>
      </TableCell>
      <TableCell className="min-w-40">{changesOf(token)}</TableCell>
      <TableCell className="whitespace-nowrap">
        {token.lastUsedAt ? ago(token.lastUsedAt) : t("users.never")}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {/* One line, so Revoke stays in view; who made it is on hover and in the audit log. */}
        <span
          title={t("tokens.madeBy", {
            when: formatDateTime(token.createdAt),
            name: token.createdBy ?? "—",
          })}
        >
          {!live
            ? t("tokens.status.expired")
            : token.expiresAt
              ? formatDateTime(token.expiresAt)
              : t("tokens.ends.never")}
        </span>
      </TableCell>
      <TableCell className="whitespace-nowrap text-right">
        {/* An expired token is revoked too, to clear it off the list. */}
        <Button variant="danger-outline" size="small" onClick={() => setConfirming(true)}>
          {t("tokens.revoke")}
          <span className="sr-only"> {token.name}</span>
        </Button>
        {confirming && (
          <ConfirmDialog
            open
            onOpenChange={setConfirming}
            title={t("tokens.revoke.title", name)}
            description={t("tokens.revoke.body")}
            confirm={t("tokens.revoke")}
            destructive
            onConfirm={() =>
              void run(() => tokensApi.revoke(token.id), t("tokens.revoke.done", name))
            }
          />
        )}
      </TableCell>
    </TableRow>
  );
}

/** Mounted each time it opens, so a cancelled token doesn't carry its choices into the next. */
function MakeDialog({
  onClose,
  onMade,
}: {
  onClose: () => void;
  onMade: (made: ApiTokenCreated) => void;
}) {
  const queryClient = useQueryClient();
  const pages = useQuery(pagesQuery);
  const listings = pages.data?.filter((page) => page.kind === "listing");
  const [name, setName] = useState("");
  const [role, setRole] = useState<ApiTokenRole>("contentManager");
  const [areas, setAreas] = useState<Set<ApiTokenArea>>(new Set(["entries", "media"]));
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [days, setDays] = useState<number | null>(API_TOKEN_MAX_DAYS);
  const make = useAction();
  // All pages covers every listing's entries, so the listings don't apply then.
  const allPages = areas.has("pages");
  const byListing = areas.has("entries") && !allPages;
  const ready = name.trim() !== "" && areas.size > 0 && (!byListing || chosen.size > 0);

  const toggle = toggleIn(setChosen);
  const toggleArea = toggleIn(setAreas);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogBody className="sm:w-lg">
        <DialogHeader>
          <DialogTitle>{t("tokens.make.title")}</DialogTitle>
        </DialogHeader>
        <DialogContent className="gap-stack-md flex flex-col">
          <Field name="name">
            <FieldLabel>{t("tokens.column.name")}</FieldLabel>
            <Input
              value={name}
              maxLength={API_TOKEN_NAME_MAX}
              placeholder={t("tokens.name.placeholder")}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>

          <RolePicker
            value={role}
            onChange={setRole}
            roles={ApiTokenRole.options}
            hint={(option) => t(`tokens.roleHint.${option}`)}
          />

          <Fieldset>
            <FieldsetLegend className="text-label-md font-medium">
              {t("tokens.column.changes")}
            </FieldsetLegend>
            <div className="flex flex-col gap-3">
              {ApiTokenArea.options.map((area) => (
                <div key={area} className="flex flex-col gap-2">
                  <Field name={`area-${area}`}>
                    <FieldItem className="items-start">
                      <Checkbox
                        className="mt-0.5"
                        checked={areas.has(area) || (area === "entries" && allPages)}
                        disabled={area === "entries" && allPages}
                        onCheckedChange={(on) => toggleArea(area, on)}
                      />
                      <div className="flex flex-col gap-0.5">
                        <FieldLabel>{t(`tokens.area.${area}`)}</FieldLabel>
                        {area === "entries" && allPages && (
                          <FieldDescription>{t("tokens.area.entries.covered")}</FieldDescription>
                        )}
                      </div>
                    </FieldItem>
                  </Field>
                  {area === "entries" && byListing && (
                    // The listings it may write under, set in under the choice they belong to.
                    <div className="flex flex-col gap-2 pl-7">
                      {!listings ? (
                        <Skeleton className="h-12 w-full rounded-md" />
                      ) : listings.length === 0 ? (
                        <p className="text-body-sm text-txt-black-700 m-0">
                          {t("tokens.listings.none")}
                        </p>
                      ) : (
                        listings.map((listing) => (
                          <Field key={listing.id} name={`listing-${listing.id}`}>
                            <FieldItem>
                              <Checkbox
                                checked={chosen.has(listing.id)}
                                onCheckedChange={(on) => toggle(listing.id, on)}
                              />
                              <FieldLabel>
                                {listing.title || t("tokens.untitled")}
                                <span className="text-txt-black-500 font-normal">
                                  {" "}
                                  {listing.path}
                                </span>
                              </FieldLabel>
                            </FieldItem>
                          </Field>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Fieldset>

          <Field name="days" className="w-56">
            <FieldLabel>{t("tokens.days")}</FieldLabel>
            <Select
              items={[
                ...DAYS.map((count) => ({
                  value: String(count),
                  label: t("tokens.days.option", { count }),
                })),
                { value: NEVER, label: t("tokens.days.never") },
              ]}
              value={days === null ? NEVER : String(days)}
              onValueChange={(value) => setDays(value === NEVER ? null : Number(value))}
            />
          </Field>

          {make.error && (
            <Callout variant="danger">
              <CalloutTitle>{make.error}</CalloutTitle>
            </Callout>
          )}
        </DialogContent>
        <DialogFooter>
          <Button variant="default-outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary-fill"
            disabled={!ready || make.pending}
            onClick={() =>
              void make.run(
                () =>
                  tokensApi.make({
                    name: name.trim(),
                    role,
                    areas: [...areas],
                    listingIds: [...chosen],
                    days,
                  }),
                (created) => {
                  void queryClient.invalidateQueries({ queryKey: tokensQuery.queryKey });
                  onMade(created);
                },
              )
            }
          >
            {t("tokens.make.confirm")}
          </Button>
        </DialogFooter>
      </DialogBody>
    </Dialog>
  );
}
