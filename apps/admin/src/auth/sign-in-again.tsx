/**
 * Signing in again without leaving the screen: when the sign-in runs out
 * mid-session, this asks for the password (and the two-factor code) over
 * whatever is open, so unsaved work stays where it is. Someone else at the
 * keyboard can still go to the full Sign in instead.
 */
import type { Me } from "@laman/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { linkClass } from "@/components/text-link";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { t } from "@/i18n";
import { authApi, meQuery, useMe } from "@/lib/auth";
import { sessionLost } from "@/lib/session";
import { useStore } from "@/lib/store";
import { useAction } from "@/lib/use-action";
import { AuthField, AuthForm } from "./frame";

export function SignInAgain() {
  const lost = useStore(sessionLost);
  // A new form each time, so nothing typed last time is still in it.
  return lost ? <SignInAgainDialog /> : null;
}

function SignInAgainDialog() {
  const me = useMe();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [stage, setStage] = useState<"password" | "code">("password");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const step = useAction();

  const finish = async (next: Me) => {
    if (next.stage === "totp") return setStage("code");
    if (next.stage !== "full") return leave();
    queryClient.setQueryData(meQuery.queryKey, next);
    sessionLost.set(false);
    await queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== "me" });
  };
  /** The full Sign in, for someone else, or for a sign-in with steps this can't do. */
  const leave = () => {
    sessionLost.set(false);
    queryClient.removeQueries({ queryKey: meQuery.queryKey });
    void router.invalidate();
  };

  return (
    // Stays open until they've signed in: without it, nothing on screen can be saved.
    <Dialog open>
      <DialogBody className="sm:w-md" hideClose dismissible={false}>
        <DialogHeader>
          <DialogTitle>{t("auth.again.title")}</DialogTitle>
          <DialogDescription>
            {stage === "password"
              ? t("auth.again.description", { name: me.displayName })
              : t("auth.code.description")}
          </DialogDescription>
        </DialogHeader>
        <DialogContent className="gap-stack-md flex flex-col pb-6">
          {stage === "password" ? (
            <AuthForm
              submit={t("auth.again.submit")}
              pending={step.pending}
              error={step.error}
              onSubmit={() => void step.run(() => authApi.signIn(me.username, password), finish)}
            >
              <AuthField
                name="password"
                type="password"
                label={t("auth.password")}
                autoComplete="current-password"
                value={password}
                onChange={setPassword}
              />
            </AuthForm>
          ) : (
            <AuthForm
              submit={t("auth.code.submit")}
              pending={step.pending}
              error={step.error}
              onSubmit={() => void step.run(() => authApi.code(code), finish)}
            >
              <AuthField
                name="code"
                label={t("auth.code.label")}
                hint={t("auth.code.hint")}
                autoComplete="one-time-code"
                maxLength={20}
                value={code}
                onChange={setCode}
              />
            </AuthForm>
          )}
          <button type="button" className={`text-body-sm self-start ${linkClass}`} onClick={leave}>
            {t("auth.again.someoneElse", { name: me.displayName })}
          </button>
        </DialogContent>
      </DialogBody>
    </Dialog>
  );
}
