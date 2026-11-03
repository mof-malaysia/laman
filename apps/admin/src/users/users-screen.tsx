/**
 * People, for Admins: who has an account, their role and two-factor, and
 * the one-time links that let someone in (an invite) or back in (a reset).
 * A link is shown once, to copy and hand over: there's no email.
 */
import {
  AssignableRole,
  type Invite,
  type OneTimeLink,
  type UserSummary,
} from "@fiscal-sb/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useId, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { TwoFactorTag } from "@/components/two-factor-tag";
import { Button } from "@/components/ui/button";
import { Callout, CalloutContent, CalloutTitle } from "@/components/ui/callout";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldItem, FieldLabel } from "@/components/ui/field";
import { Fieldset, FieldsetLegend } from "@/components/ui/fieldset";
import { Input } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/ui/page-header";
import { Radio, RadioButton, RadioHintText, RadioItem, RadioLabel } from "@/components/ui/radio";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
} from "@/components/ui/table";
import { Tag } from "@/components/ui/tag";
import { t } from "@/i18n";
import { apiError } from "@/lib/api";
import { roleLabels, useMe, usersApi, usersQuery } from "@/lib/auth";
import useToast from "@/lib/ftds/hooks/use-toast";
import { formatAgo, formatDateTime } from "@/lib/pages";
import { useAction } from "@/lib/use-action";

/** After this long without signing in, an account is flagged as possibly no longer needed. */
const STALE_DAYS = 90;
const DAY_MS = 86_400_000;

const daysSince = (iso: string) => Math.floor((Date.now() - Date.parse(iso)) / DAY_MS);

/** Active, or not signed in for STALE_DAYS (counting from when it was made, if never). */
const isStale = (person: UserSummary) =>
  !person.disabled &&
  person.role !== "superAdmin" &&
  daysSince(person.lastSignInAt ?? person.createdAt) >= STALE_DAYS;

const isExpired = (invite: Invite) => Date.parse(invite.expiresAt) <= Date.now();

/** Who an invite is for, as its maker wrote it. */
const noteOf = (invite: Invite) => invite.note || t("users.noNote");

/** An invite still to be made: its role and who it's for. */
type InviteDraft = { role: AssignableRole; note: string };

/** Runs an action, then refreshes `queryKey` and says `done`; says the server's reason when it fails. */
function useRun(queryKey: readonly unknown[]) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return async (work: () => Promise<unknown>, done?: string) => {
    try {
      await work();
      void queryClient.invalidateQueries({ queryKey });
      if (done) toast({ variant: "success", title: done });
    } catch (caught) {
      toast({
        variant: "error",
        title: t("users.failed"),
        description: (await apiError(caught))?.message,
      });
    }
  };
}

/** "3h ago", "2 weeks ago", "4 months ago": how long it's been is what matters here. */
function formatSince(iso: string) {
  const days = daysSince(iso);
  if (days < 7) return formatAgo(iso);
  if (days < 60) return t("users.since.weeks", { count: Math.floor(days / 7) });
  if (days < 730) return t("users.since.months", { count: Math.floor(days / 30) });
  return t("users.since.years", { count: Math.floor(days / 365) });
}

export function UsersScreen() {
  const me = useMe();
  const people = useQuery(usersQuery);
  const invites = useQuery({ queryKey: ["invites"], queryFn: usersApi.invites });
  const [inviting, setInviting] = useState<InviteDraft>();
  const [shown, setShown] = useState<{ title: string; description: string; link: OneTimeLink }>();
  // Disabled accounts last: the people who can sign in come first.
  const sorted = people.data?.toSorted((a, b) => Number(a.disabled) - Number(b.disabled));
  const stale = sorted?.filter(isStale).length ?? 0;

  return (
    <div className="p-surface gap-stack-lg mx-auto flex max-w-6xl flex-col">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle size="headline">{t("nav.users")}</PageHeaderTitle>
          <PageHeaderDescription>{t("users.intro")}</PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <Button variant="default-ghost" size="small" render={<Link to="/users/audit" />}>
            {t("users.audit")}
          </Button>
          <Button
            variant="primary-fill"
            size="small"
            onClick={() => setInviting({ role: "editor", note: "" })}
          >
            {t("users.invite")}
          </Button>
        </PageHeaderActions>
      </PageHeader>

      {stale > 0 && (
        <Callout variant="warning">
          <CalloutTitle>{t("users.stale.title", { count: stale, days: STALE_DAYS })}</CalloutTitle>
          <CalloutContent>{t("users.stale.body")}</CalloutContent>
        </Callout>
      )}

      <div className="gap-stack-sm flex flex-col">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("users.column.name")}</TableHead>
              <TableHead>{t("users.column.role")}</TableHead>
              <TableHead>{t("users.column.status")}</TableHead>
              <TableHead>{t("users.column.twoFactor")}</TableHead>
              <TableHead>{t("users.column.lastSignIn")}</TableHead>
              <TableHead>
                <span className="sr-only">{t("dashboard.column.actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!sorted
              ? [0, 1, 2].map((row) => (
                  <TableRow key={row}>
                    {[0, 1, 2, 3, 4, 5].map((cell) => (
                      <TableCell key={cell}>
                        <TableSkeleton />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : sorted.map((person) => (
                  <PersonRow
                    key={person.id}
                    person={person}
                    self={person.id === me.id}
                    onLink={(link) =>
                      setShown({
                        title: t("users.reset.shown.title", { name: person.displayName }),
                        description: t("users.reset.shown.body"),
                        link,
                      })
                    }
                  />
                ))}
          </TableBody>
        </Table>
        <p className="text-body-sm text-txt-black-700 max-w-prose">{t("users.superAdmin.note")}</p>
      </div>

      {invites.data && invites.data.length > 0 && (
        <PendingInvites invites={invites.data} onRemake={setInviting} />
      )}

      {inviting && (
        <InviteDialog
          initial={inviting}
          onClose={() => setInviting(undefined)}
          onMade={(link, note) =>
            setShown({
              title: note
                ? t("users.invite.shown.titleFor", { note })
                : t("users.invite.shown.title"),
              description: t("users.invite.shown.body"),
              link,
            })
          }
        />
      )}
      {shown && <LinkDialog {...shown} onClose={() => setShown(undefined)} />}
    </div>
  );
}

/** The actions behind a confirm: their messages are `users.<action>`, `.title`, `.body` and `.done`. */
type Confirm = "disable" | "clear2fa" | "signOut";

function PersonRow({
  person,
  self,
  onLink,
}: {
  person: UserSummary;
  self: boolean;
  onLink: (link: OneTimeLink) => void;
}) {
  const navigate = useNavigate();
  const run = useRun(usersQuery.queryKey);
  const [confirm, setConfirm] = useState<Confirm>();
  const [changingRole, setChangingRole] = useState(false);
  // The super admin and your own account can't be changed from here.
  const locked = person.role === "superAdmin" || self;
  const name = { name: person.displayName };

  const confirms: Record<Confirm, { destructive: boolean; work: () => Promise<unknown> }> = {
    disable: { destructive: true, work: () => usersApi.update(person.id, { disabled: true }) },
    clear2fa: { destructive: true, work: () => usersApi.clearTwoFactor(person.id) },
    signOut: { destructive: false, work: () => usersApi.signOut(person.id) },
  };

  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-col">
          <span className="text-txt-black-900 font-medium">
            {person.displayName}
            {self && <span className="text-txt-black-500 font-normal"> {t("users.you")}</span>}
          </span>
          {person.username !== person.displayName.toLowerCase() && (
            <span className="text-body-xs text-txt-black-500">{person.username}</span>
          )}
        </div>
      </TableCell>
      <TableCell>{t(roleLabels[person.role])}</TableCell>
      <TableCell>
        {person.disabled ? (
          <Tag size="small" variant="danger">
            {t("users.disabled")}
          </Tag>
        ) : isStale(person) ? (
          <Tag size="small" variant="warning">
            {t("users.status.inactive")}
          </Tag>
        ) : (
          t("users.status.active")
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <TwoFactorTag on={person.twoFactor} />
          {self && !person.twoFactor && (
            <Link to="/account" className="text-body-sm text-txt-primary underline">
              {t("users.twoFactor.setUp")}
            </Link>
          )}
        </div>
      </TableCell>
      <TableCell className="tabular-nums">
        {person.lastSignInAt ? (
          <time dateTime={person.lastSignInAt} title={formatDateTime(person.lastSignInAt)}>
            {formatSince(person.lastSignInAt)}
          </time>
        ) : (
          t("users.never")
        )}
      </TableCell>
      <TableCell className="text-right">
        {self && (
          <Button variant="default-ghost" size="small" render={<Link to="/account" />}>
            {t("users.yourAccount")}
          </Button>
        )}
        {!locked && (
          <Menu>
            <MenuTrigger render={<Button variant="default-ghost" size="small" />}>
              {t("users.actions")}
              <span className="sr-only"> {person.displayName}</span>
            </MenuTrigger>
            <MenuContent>
              <MenuItem onClick={() => setChangingRole(true)}>{t("users.role.change")}</MenuItem>
              <MenuItem
                onClick={() => void run(async () => onLink(await usersApi.resetLink(person.id)))}
              >
                {t("users.reset")}
              </MenuItem>
              {person.twoFactor && (
                <MenuItem onClick={() => setConfirm("clear2fa")}>{t("users.clear2fa")}</MenuItem>
              )}
              <MenuItem onClick={() => setConfirm("signOut")}>{t("users.signOut")}</MenuItem>
              <MenuItem
                onClick={() => void navigate({ to: "/users/audit", search: { userId: person.id } })}
              >
                {t("users.activity")}
              </MenuItem>
              <MenuSeparator />
              {person.disabled ? (
                <MenuItem
                  onClick={() =>
                    void run(
                      () => usersApi.update(person.id, { disabled: false }),
                      t("users.enabled", name),
                    )
                  }
                >
                  {t("users.enable")}
                </MenuItem>
              ) : (
                <MenuItem variant="danger" onClick={() => setConfirm("disable")}>
                  {t("users.disable")}
                </MenuItem>
              )}
            </MenuContent>
          </Menu>
        )}
        {confirm && (
          <ConfirmDialog
            open
            onOpenChange={(open) => !open && setConfirm(undefined)}
            title={t(`users.${confirm}.title`, name)}
            description={t(`users.${confirm}.body`)}
            confirm={t(`users.${confirm}`)}
            destructive={confirms[confirm].destructive}
            onConfirm={() => void run(confirms[confirm].work, t(`users.${confirm}.done`, name))}
          />
        )}
        {changingRole && (
          <RoleDialog
            person={person}
            onClose={() => setChangingRole(false)}
            onChange={(role) =>
              run(() => usersApi.update(person.id, { role }), t("users.role.changed", name))
            }
          />
        )}
      </TableCell>
    </TableRow>
  );
}

/** The assignable roles as a choice, each with what it can do. */
function RolePicker({
  value,
  onChange,
  current,
}: {
  value: AssignableRole;
  onChange: (role: AssignableRole) => void;
  /** Their role now, marked as such. */
  current?: AssignableRole;
}) {
  const id = useId();
  return (
    <Field name="role">
      <Fieldset
        render={<Radio value={value} onValueChange={(role) => onChange(role as AssignableRole)} />}
      >
        <FieldsetLegend className="text-label-md font-medium">
          {t("users.column.role")}
        </FieldsetLegend>
        {AssignableRole.options.map((role) => (
          // Each radio in its own FieldItem, or the Field gives them all one id.
          <FieldItem key={role} className="items-start">
            <RadioItem className="items-start">
              <RadioButton
                value={role}
                id={`${id}-${role}`}
                aria-describedby={`${id}-${role}-hint`}
                className="mt-0.5"
              />
              <div className="flex flex-col gap-0.5">
                <RadioLabel htmlFor={`${id}-${role}`} className="font-medium">
                  {t(roleLabels[role])}
                  {role === current && (
                    <span className="text-txt-black-500 font-normal"> {t("users.role.now")}</span>
                  )}
                </RadioLabel>
                <RadioHintText id={`${id}-${role}-hint`}>
                  {t(`users.invite.roleHint.${role}`)}
                </RadioHintText>
              </div>
            </RadioItem>
          </FieldItem>
        ))}
      </Fieldset>
    </Field>
  );
}

/** A new role, chosen with what it means in view, and confirmed by name. */
function RoleDialog({
  person,
  onClose,
  onChange,
}: {
  person: UserSummary;
  onClose: () => void;
  onChange: (role: AssignableRole) => Promise<void>;
}) {
  const current = person.role as AssignableRole;
  const [role, setRole] = useState(current);
  const [pending, setPending] = useState(false);
  const name = { name: person.displayName };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogBody className="sm:w-lg">
        <DialogHeader>
          <DialogTitle>{t("users.role.title", name)}</DialogTitle>
          <DialogDescription>{t("users.role.description")}</DialogDescription>
        </DialogHeader>
        <DialogContent className="gap-stack-md flex flex-col">
          <RolePicker value={role} onChange={setRole} current={current} />
          {role === "admin" && role !== current && (
            <Callout variant="warning">
              <CalloutTitle>{t("users.role.admin.title")}</CalloutTitle>
              <CalloutContent>{t("users.role.admin.body", name)}</CalloutContent>
            </Callout>
          )}
        </DialogContent>
        <DialogFooter>
          <Button variant="default-outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary-fill"
            disabled={role === current || pending}
            onClick={() => {
              setPending(true);
              void onChange(role).finally(onClose);
            }}
          >
            {role === current
              ? t("users.role.confirmSame")
              : t("users.role.confirm", { ...name, role: t(roleLabels[role]) })}
          </Button>
        </DialogFooter>
      </DialogBody>
    </Dialog>
  );
}

function PendingInvites({
  invites,
  onRemake,
}: {
  invites: Invite[];
  onRemake: (invite: InviteDraft) => void;
}) {
  const run = useRun(["invites"]);
  const [revoking, setRevoking] = useState<Invite>();

  /** Revokes a live invite, or quietly clears an expired one off the list. */
  const remove = (invite: Invite) =>
    run(
      () => usersApi.revoke(invite.id),
      isExpired(invite) ? undefined : t("users.revoke.done", { note: noteOf(invite) }),
    );

  return (
    <section className="gap-stack-sm flex flex-col">
      <h2 className="text-heading-3xs text-txt-black-900 font-semibold">{t("users.pending")}</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("users.column.for")}</TableHead>
            <TableHead>{t("users.column.role")}</TableHead>
            <TableHead>{t("users.column.madeBy")}</TableHead>
            <TableHead>{t("users.column.expires")}</TableHead>
            <TableHead>
              <span className="sr-only">{t("dashboard.column.actions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invites.map((invite) => {
            const expired = isExpired(invite);
            const label = noteOf(invite);
            return (
              // An expired invite is greyed out; its tag and buttons keep their own colours.
              <TableRow key={invite.id} className={expired ? "text-txt-black-500" : undefined}>
                <TableCell>{label}</TableCell>
                <TableCell>{t(roleLabels[invite.role])}</TableCell>
                <TableCell>{invite.createdBy ?? "—"}</TableCell>
                <TableCell className="tabular-nums">
                  {expired ? (
                    <Tag size="small" variant="warning">
                      {t("users.invite.expired", { when: formatAgo(invite.expiresAt) })}
                    </Tag>
                  ) : (
                    formatDateTime(invite.expiresAt)
                  )}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {expired && (
                    <Button
                      variant="default-ghost"
                      size="small"
                      onClick={() =>
                        onRemake({ role: invite.role as AssignableRole, note: invite.note })
                      }
                    >
                      {t("users.invite.remake")}
                      <span className="sr-only"> {label}</span>
                    </Button>
                  )}
                  <Button
                    variant={expired ? "default-ghost" : "danger-ghost"}
                    size="small"
                    onClick={() => (expired ? void remove(invite) : setRevoking(invite))}
                  >
                    {expired ? t("users.invite.clear") : t("users.revoke")}
                    <span className="sr-only"> {label}</span>
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {revoking && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setRevoking(undefined)}
          title={t("users.revoke.title", { note: noteOf(revoking) })}
          description={t("users.revoke.body")}
          confirm={t("users.revoke")}
          destructive
          onConfirm={() => void remove(revoking)}
        />
      )}
    </section>
  );
}

/** Mounted each time it opens, so a cancelled invite doesn't carry its role into the next. */
function InviteDialog({
  initial,
  onClose,
  onMade,
}: {
  initial: InviteDraft;
  onClose: () => void;
  onMade: (link: OneTimeLink, note: string) => void;
}) {
  const queryClient = useQueryClient();
  const [role, setRole] = useState(initial.role);
  const [note, setNote] = useState(initial.note);
  const make = useAction();

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogBody className="sm:w-lg">
        <DialogHeader>
          <DialogTitle>{t("users.invite.title")}</DialogTitle>
          <DialogDescription>{t("users.invite.description")}</DialogDescription>
        </DialogHeader>
        <DialogContent className="gap-stack-md flex flex-col">
          <Field name="note">
            <FieldLabel>{t("users.invite.note")}</FieldLabel>
            <FieldDescription>{t("users.invite.noteHint")}</FieldDescription>
            <Input value={note} maxLength={80} onChange={(event) => setNote(event.target.value)} />
          </Field>
          <RolePicker value={role} onChange={setRole} />
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
            disabled={make.pending}
            onClick={() =>
              void make.run(
                () => usersApi.invite(role, note.trim()),
                (link) => {
                  void queryClient.invalidateQueries({ queryKey: ["invites"] });
                  onClose();
                  onMade(link, note.trim());
                },
              )
            }
          >
            {t("users.invite.make")}
          </Button>
        </DialogFooter>
      </DialogBody>
    </Dialog>
  );
}

/**
 * A one-time link, once: the whole address to copy, and when it stops working.
 * Copying is the main action; closing before copying asks first, since the
 * link can't be shown again.
 */
function LinkDialog({
  title,
  description,
  link,
  onClose,
}: {
  title: string;
  description: string;
  link: OneTimeLink;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<"copied" | "failed">();
  const [leaving, setLeaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const address = `${window.location.origin}${link.path}`;
  const close = () => (status === "copied" ? onClose() : setLeaving(true));
  const copy = () =>
    navigator.clipboard.writeText(address).then(
      () => setStatus("copied"),
      () => {
        // No clipboard (an older browser, or permission refused): select it to copy by hand.
        setStatus("failed");
        input.current?.focus();
        input.current?.select();
      },
    );

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogBody className="sm:w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogContent className="gap-stack-md flex flex-col">
          <Field name="link">
            <FieldLabel htmlFor={inputId}>{t("users.link.label")}</FieldLabel>
            <FieldDescription>
              {t("users.link.expires", { when: formatDateTime(link.expiresAt) })}
            </FieldDescription>
            <Input
              ref={input}
              id={inputId}
              readOnly
              value={address}
              onFocus={(event) => event.target.select()}
              onCopy={() => setStatus("copied")}
            />
          </Field>
          <output className="text-body-sm text-txt-black-700 empty:hidden">
            {status === "copied" && t("users.link.copiedStatus")}
            {status === "failed" && t("users.link.copyFailed")}
          </output>
          <Callout variant="warning">
            <CalloutTitle>{t("users.link.once.title")}</CalloutTitle>
            <CalloutContent>{t("users.link.once.body")}</CalloutContent>
          </Callout>
        </DialogContent>
        <DialogFooter>
          {status === "copied" ? (
            <>
              <Button variant="default-outline" onClick={() => void copy()}>
                {t("users.link.copyAgain")}
              </Button>
              <Button variant="primary-fill" onClick={onClose}>
                {t("users.link.done")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="default-outline" onClick={close}>
                {t("users.link.close")}
              </Button>
              <Button variant="primary-fill" onClick={() => void copy()}>
                {t("users.link.copy")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogBody>
      <ConfirmDialog
        open={leaving}
        onOpenChange={setLeaving}
        title={t("users.link.leave.title")}
        description={t("users.link.leave.body")}
        confirm={t("users.link.leave.confirm")}
        cancel={t("users.link.leave.cancel")}
        destructive
        onConfirm={onClose}
      />
    </Dialog>
  );
}
