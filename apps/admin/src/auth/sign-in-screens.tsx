/**
 * Signing in, and the steps it can need after the password: a code from the
 * authenticator app, a new password (the first account's, or one an admin
 * asked to change), or setting up two-factor when the site requires it.
 */
import { type Me, Password } from "@fiscal-sb/contracts";
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { authApi, continueSignIn, meQuery, nextPath, stagePaths } from "@/lib/auth";
import { useAction } from "@/lib/use-action";
import { AuthField, AuthForm, AuthFrame, SignOutLink } from "./frame";
import { TwoFactorSetup } from "./two-factor";

export function SignInScreen() {
  const me = useQuery(meQuery);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [missing, setMissing] = useState(false);
  const step = useAction();
  // Already signed in, or partway: carry on from there.
  if (me.data) return <Resume me={me.data} />;
  return (
    <AuthFrame title={t("auth.signIn.title")} description={t("auth.signIn.description")}>
      <AuthForm
        submit={t("auth.signIn.submit")}
        pending={step.pending}
        error={step.error}
        onSubmit={() => {
          setMissing(!username || !password);
          if (username && password)
            void step.run(() => authApi.signIn(username, password), continueSignIn);
        }}
      >
        <AuthField
          name="username"
          label={t("auth.username")}
          autoComplete="username"
          value={username}
          onChange={setUsername}
          error={missing && !username ? t("auth.username.missing") : undefined}
        />
        <AuthField
          name="password"
          type="password"
          label={t("auth.password")}
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          error={missing && !password ? t("auth.password.missing") : undefined}
        />
      </AuthForm>
      <p className="text-body-sm text-txt-black-700">{t("auth.signIn.forgot")}</p>
    </AuthFrame>
  );
}

function Resume({ me }: { me: Me }) {
  if (me.stage === "full") {
    window.location.replace(nextPath(window.location.search));
    return null;
  }
  return <Navigate to={stagePaths[me.stage]} search={(s) => s} replace />;
}

/** The step's screen only while the sign-in is at that step; otherwise where it is. */
function AtStage({ stage, children }: { stage: Me["stage"]; children: ReactNode }) {
  const me = useQuery(meQuery);
  if (me.isPending) return <Skeleton className="m-auto h-64 w-full max-w-md" />;
  if (!me.data) return <Navigate to="/sign-in" search={(s) => s} replace />;
  if (me.data.stage !== stage) return <Resume me={me.data} />;
  return children;
}

export function CodeScreen() {
  const [code, setCode] = useState("");
  const step = useAction();
  return (
    <AtStage stage="totp">
      <AuthFrame title={t("auth.code.title")} description={t("auth.code.description")}>
        <AuthForm
          submit={t("auth.code.submit")}
          pending={step.pending}
          error={step.error}
          onSubmit={() => void step.run(() => authApi.code(code), continueSignIn)}
        >
          <AuthField
            name="code"
            label={t("auth.code.label")}
            hint={t("auth.code.hint")}
            autoComplete="one-time-code"
            inputMode="text"
            maxLength={20}
            value={code}
            onChange={setCode}
          />
        </AuthForm>
        <SignOutLink />
      </AuthFrame>
    </AtStage>
  );
}

export function PasswordScreen() {
  const step = useAction();
  return (
    <AtStage stage="password">
      <AuthFrame
        title={t("auth.newPassword.title")}
        description={t("auth.newPassword.description")}
      >
        <NewPasswordForm
          submit={t("auth.newPassword.submit")}
          pending={step.pending}
          error={step.error}
          onSubmit={(password) => void step.run(() => authApi.password(password), continueSignIn)}
        />
        <SignOutLink />
      </AuthFrame>
    </AtStage>
  );
}

export function EnrolScreen() {
  return (
    <AtStage stage="enrol">
      <AuthFrame title={t("auth.enrol.title")} description={t("auth.enrol.required")}>
        <TwoFactorSetup onDone={continueSignIn} />
        <SignOutLink />
      </AuthFrame>
    </AtStage>
  );
}

const PASSWORD_MAX = 128;

/** A new password typed twice, checked against the contract's rule before it's sent. */
export function NewPasswordForm({
  submit,
  pending,
  error,
  onSubmit,
  current,
  check,
  children,
}: {
  submit: string;
  pending: boolean;
  error?: string | undefined;
  onSubmit: (password: string, current: string) => void;
  /** Ask for the current password too: changing it from Account. */
  current?: boolean;
  /** Whether the fields in `children` are ready; they show their own errors once `checked`. */
  check?: (checked: boolean) => boolean;
  /** Fields before the password ones, sent with the same form (Join's name and username). */
  children?: ReactNode;
}) {
  const [now, setNow] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [checked, setChecked] = useState(false);
  const invalid = !Password.safeParse(password).success;
  const differs = password !== again;
  return (
    <AuthForm
      submit={submit}
      pending={pending}
      error={error}
      onSubmit={() => {
        setChecked(true);
        const others = check?.(true) ?? true;
        if (others && !invalid && !differs && (!current || now)) onSubmit(password, now);
      }}
    >
      {children}
      {current && (
        <AuthField
          name="current"
          type="password"
          label={t("auth.password.current")}
          autoComplete="current-password"
          value={now}
          onChange={setNow}
          error={checked && !now ? t("auth.password.missing") : undefined}
        />
      )}
      <AuthField
        name="password"
        type="password"
        label={t("auth.password.new")}
        hint={t("auth.password.rules")}
        autoComplete="new-password"
        maxLength={PASSWORD_MAX}
        value={password}
        onChange={setPassword}
        error={checked && invalid ? t("auth.password.short") : undefined}
      />
      <AuthField
        name="again"
        type="password"
        label={t("auth.password.again")}
        autoComplete="new-password"
        maxLength={PASSWORD_MAX}
        value={again}
        onChange={setAgain}
        error={checked && !invalid && differs ? t("auth.password.differs") : undefined}
      />
    </AuthForm>
  );
}
