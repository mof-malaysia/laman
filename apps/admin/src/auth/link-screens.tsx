/**
 * The pages a one-time link opens: Join (an invite) and Reset (a new
 * password). The token is in the address's fragment, so it never reaches a
 * server log; the page reads it and posts it.
 */
import { DisplayName, type LinkInfo, Username } from "@fiscal-sb/contracts";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { authApi, continueSignIn, roleLabels } from "@/lib/auth";
import { useAction } from "@/lib/use-action";
import { AuthField, AuthFrame, ToSignIn } from "./frame";
import { NewPasswordForm } from "./sign-in-screens";

/**
 * The link's token, read once as the page opens: saving takes it out of the
 * address, and that mustn't turn the page into "This link doesn't work".
 * What the link is for, or undefined while it's read; `failed` when it can't be used.
 */
function useLink(kind: LinkInfo["kind"]) {
  const [token] = useState(() => window.location.hash.slice(1));
  const link = useQuery({
    queryKey: ["link", token],
    queryFn: () => authApi.link(token),
    retry: false,
    enabled: token.length > 0,
  });
  const failed = !token || link.isError || (link.data !== undefined && link.data.kind !== kind);
  return { token, info: link.data, failed };
}

function Expired() {
  return (
    <AuthFrame title={t("auth.link.expired.title")} description={t("auth.link.expired.body")}>
      <ToSignIn />
    </AuthFrame>
  );
}

export function JoinScreen() {
  const { token, info, failed } = useLink("invite");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [checked, setChecked] = useState(false);
  const join = useAction();
  if (failed) return <Expired />;
  if (!info) return <Skeleton className="m-auto h-80 w-full max-w-md" />;
  const badName = !DisplayName.safeParse(displayName).success;
  const badUsername = !Username.safeParse(username).success;

  return (
    <AuthFrame
      title={t("auth.join.title")}
      description={t("auth.join.description", { role: t(roleLabels[info.role ?? "editor"]) })}
    >
      <NewPasswordForm
        submit={t("auth.join.submit")}
        pending={join.pending}
        error={join.error}
        check={(now) => {
          setChecked(now);
          return !badName && !badUsername;
        }}
        onSubmit={(password) =>
          void join.run(
            () => authApi.join({ token, username, displayName, password }),
            continueSignIn,
          )
        }
      >
        <AuthField
          name="displayName"
          label={t("auth.join.name")}
          hint={t("auth.join.nameHint")}
          autoComplete="name"
          maxLength={80}
          value={displayName}
          onChange={setDisplayName}
          error={checked && badName ? t("auth.join.name.missing") : undefined}
        />
        <AuthField
          name="username"
          label={t("auth.username")}
          hint={t("auth.username.rules")}
          autoComplete="username"
          maxLength={32}
          value={username}
          onChange={(value) => setUsername(value.toLowerCase())}
          error={checked && badUsername ? t("auth.username.rules") : undefined}
        />
      </NewPasswordForm>
    </AuthFrame>
  );
}

export function ResetScreen() {
  const { token, info, failed } = useLink("reset");
  const [done, setDone] = useState(false);
  const reset = useAction();
  if (failed) return <Expired />;
  if (!info) return <Skeleton className="m-auto h-64 w-full max-w-md" />;
  if (done)
    return (
      <AuthFrame title={t("auth.reset.done.title")} description={t("auth.reset.done.body")}>
        <ToSignIn primary />
      </AuthFrame>
    );

  return (
    <AuthFrame
      title={t("auth.reset.title")}
      description={t("auth.reset.description", { username: info.username ?? "" })}
    >
      <NewPasswordForm
        submit={t("auth.reset.submit")}
        pending={reset.pending}
        error={reset.error}
        onSubmit={(password) =>
          void reset.run(
            () => authApi.reset(token, password),
            () => {
              // The token is used up: keep it out of the history.
              window.history.replaceState(null, "", window.location.pathname);
              setDone(true);
            },
          )
        }
      />
    </AuthFrame>
  );
}
