/**
 * Connect an agent: where an AI client (Claude Desktop, Codex) sends the
 * officer to sign in over OAuth. It names the agent and what it will be able
 * to do (their own permissions), then sends the browser back to the agent
 * with the answer. Signing in first is the router's job. See docs/mcp.md.
 */
import {
  CONNECTION_DAYS,
  type ConsentRequest,
  type Permission,
  permissionsOf,
} from "@laman/contracts";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Callout, CalloutContent, CalloutTitle } from "@/components/ui/callout";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldItem, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { type MessageKey, t } from "@/i18n";
import { apiError } from "@/lib/api";
import { agentsApi, roleLabels } from "@/lib/auth";
import { useAction } from "@/lib/use-action";
import { AuthFrame } from "./frame";

/** What each permission lets an agent do; agents get no tools for people or security. */
const canSay: Partial<Record<Permission, MessageKey>> = {
  "content.edit": "connect.can.content.edit",
  "content.publish": "connect.can.content.publish",
  "site.manage": "connect.can.site.manage",
};

/**
 * The router parses search values as JSON ("839201" becomes a number), so
 * they're kept as text here, and the screen reads the request from the
 * address as the agent wrote it.
 */
export const connectSearch = (search: Record<string, unknown>): Partial<ConsentRequest> =>
  Object.fromEntries(
    Object.entries(search).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]),
  );

export function ConnectScreen() {
  // The authorization request exactly as the agent wrote it: `state` must go back unchanged.
  const [request] = useState(
    () => Object.fromEntries(new URLSearchParams(window.location.search)) as ConsentRequest,
  );
  const info = useQuery({
    queryKey: ["consent", request],
    // A request the server can't answer says why, in its own words.
    queryFn: () =>
      agentsApi.consent(request).catch(async (error: unknown) => {
        throw new Error((await apiError(error))?.message ?? t("common.tryAgain"));
      }),
    retry: false,
  });
  const answer = useAction();
  const [leaving, setLeaving] = useState(false);
  // An unverified agent's Allow waits until the officer says they set it up themselves.
  const [vouched, setVouched] = useState(false);
  const decide = (allow: boolean) =>
    void answer.run(
      () => agentsApi.answer({ ...request, allow }),
      ({ redirect }) => {
        setLeaving(true);
        window.location.assign(redirect);
      },
    );

  if (info.isError)
    return (
      <AuthFrame title={t("connect.broken.title")} description={t("connect.broken.body")}>
        <p className="text-body-sm text-txt-black-500 text-pretty">
          {t("connect.broken.reason", { reason: info.error.message })}
        </p>
        <Button
          variant="default-outline"
          className="self-start"
          // oxlint-disable-next-line jsx-a11y/control-has-associated-label -- labelled by the Button's children
          render={<a href="/admin/" />}
        >
          {t("connect.toAdmin")}
        </Button>
      </AuthFrame>
    );
  if (!info.data) return <Skeleton className="m-auto h-96 w-full max-w-md" />;
  const { client, allowed, role } = info.data;

  if (leaving)
    return (
      <AuthFrame
        title={t("connect.leaving.title", { client: client.name })}
        description={t("connect.leaving.body")}
      >
        {null}
      </AuthFrame>
    );

  const superAdmin = role === "superAdmin";
  // Unverified, the safe answer is the blue one: Deny leads and Allow waits for the checkbox.
  const allowLeads = allowed && !client.unverified;

  return (
    <AuthFrame
      title={
        allowed
          ? t("connect.title", { client: client.name })
          : t("connect.notEnabled.title", { client: client.name })
      }
      description={t("connect.description", { returnsTo: client.returnsTo })}
    >
      {allowed ? (
        <>
          {client.unverified && (
            <Callout variant="danger" role="alert">
              <CalloutTitle>{t("connect.unverified.title")}</CalloutTitle>
              <CalloutContent>
                {t("connect.unverified", { client: client.name, returnsTo: client.returnsTo })}
              </CalloutContent>
            </Callout>
          )}
          <div className="gap-stack-xs flex flex-col">
            <p className="text-body-sm text-txt-black-900">
              {t("connect.actsAs", { role: t(roleLabels[role]) })}
            </p>
            <ul className="text-body-sm text-txt-black-700 list-disc ps-5">
              <li>{t("connect.can.read")}</li>
              {permissionsOf(role).flatMap((p) => {
                const said = canSay[p];
                return said ? [<li key={p}>{t(said)}</li>] : [];
              })}
            </ul>
          </div>
          <p className="text-body-sm text-txt-black-700">{t("connect.cannot")}</p>
          <p className="text-body-sm text-txt-black-700">
            {t(superAdmin ? "connect.lasts.superAdmin" : "connect.lasts", {
              days: CONNECTION_DAYS,
            })}
          </p>
          {client.unverified ? (
            <Field name="vouched">
              <FieldItem>
                <Checkbox checked={vouched} onCheckedChange={setVouched} />
                <FieldLabel>
                  {t("connect.unverified.confirm", { returnsTo: client.returnsTo })}
                </FieldLabel>
              </FieldItem>
            </Field>
          ) : (
            <Callout variant="warning">
              <CalloutTitle>{t("connect.onlyYours")}</CalloutTitle>
            </Callout>
          )}
        </>
      ) : (
        <Callout variant="warning" role="alert">
          <CalloutTitle>
            {t(superAdmin ? "connect.notEnabled.superAdmin" : "connect.notEnabled")}
          </CalloutTitle>
        </Callout>
      )}
      {answer.error && (
        <Callout variant="danger" role="alert">
          <CalloutTitle>{answer.error}</CalloutTitle>
        </Callout>
      )}
      <div className="flex flex-wrap gap-2">
        {allowLeads && (
          <Button variant="primary-fill" disabled={answer.pending} onClick={() => decide(true)}>
            {answer.pending ? t("auth.working") : t("connect.allow")}
          </Button>
        )}
        {!allowed && superAdmin && (
          <Button variant="primary-fill" render={<Link to="/account" />}>
            {t("connect.toAccount")}
          </Button>
        )}
        <Button
          variant={allowed && client.unverified ? "primary-fill" : "default-outline"}
          disabled={answer.pending}
          onClick={() => decide(false)}
        >
          {allowed ? t("connect.deny") : t("connect.back", { client: client.name })}
        </Button>
        {allowed && client.unverified && (
          <Button
            variant="default-outline"
            disabled={!vouched || answer.pending}
            onClick={() => decide(true)}
          >
            {answer.pending ? t("auth.working") : t("connect.allow")}
          </Button>
        )}
      </div>
    </AuthFrame>
  );
}
