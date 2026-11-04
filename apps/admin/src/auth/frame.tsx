/**
 * The frame of the screens before the admin: signing in and its steps, and
 * the one-time links. One narrow column, the builder's name above it.
 */
import { createContext, type FormEvent, type ReactNode, useContext } from "react";
import { AppTag } from "@/components/app-tag";
import { BrandMark } from "@/components/brand-mark";
import { card } from "@/components/card";
import { linkClass } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { Callout, CalloutTitle } from "@/components/ui/callout";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import { signOut } from "@/lib/auth";

/** Inside the frame, a form's button spans the column; in a dialog or Account it doesn't. */
const InFrame = createContext(false);

/**
 * Comfortable density, not the admin's compact one: these screens are one
 * short task, often on a phone, and 44px controls with 16px text keep mobile
 * browsers from zooming into the fields.
 */
export function AuthFrame({
  title,
  description,
  footer,
  children,
}: {
  title: string;
  description?: ReactNode;
  /** A note under a hairline at the foot of the card, apart from the task. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main id="main" data-density="comfortable" className="bg-bg-washed flex h-full overflow-y-auto">
      <div className="m-auto flex w-full max-w-md flex-col gap-5 px-4 py-12">
        <div className="flex items-center gap-2.5 self-center">
          <BrandMark />
          <span className="text-label-md text-txt-black-900 font-semibold">{t("app.name")}</span>
          <AppTag />
        </div>
        <div className={`${card} border-otl-gray-200 flex flex-col`}>
          <div className="gap-stack-lg flex flex-col p-6 sm:p-8">
            <div className="flex flex-col gap-1.5">
              <h1 className="text-heading-2xs text-txt-black-900 font-semibold text-balance">
                {title}
              </h1>
              {description && (
                <p className="text-body-sm text-txt-black-700 text-pretty">{description}</p>
              )}
            </div>
            <InFrame.Provider value>{children}</InFrame.Provider>
          </div>
          {footer && (
            <div className="border-otl-gray-200 text-body-sm text-txt-black-700 border-t px-6 py-4 text-pretty sm:px-8">
              {footer}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

/** A form whose one button submits it, with the server's refusal above the button. */
export function AuthForm({
  onSubmit,
  submit,
  pending,
  error,
  children,
}: {
  onSubmit: () => void;
  submit: string;
  pending: boolean;
  error?: string | undefined;
  children: ReactNode;
}) {
  const inFrame = useContext(InFrame);
  return (
    <form
      noValidate
      className="gap-stack-md flex flex-col"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        if (!pending) onSubmit();
      }}
    >
      {children}
      {error && (
        <Callout variant="danger" role="alert">
          <CalloutTitle>{error}</CalloutTitle>
        </Callout>
      )}
      <Button
        type="submit"
        variant="primary-fill"
        disabled={pending}
        className={inFrame ? "mt-1 w-full justify-center" : undefined}
      >
        {pending ? t("auth.working") : submit}
      </Button>
    </form>
  );
}

/** One labelled input. */
export function AuthField({
  name,
  label,
  hint,
  error,
  ...input
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string | undefined;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  inputMode?: "numeric" | "text";
  maxLength?: number;
}) {
  return (
    <Field name={name} invalid={Boolean(error)}>
      <FieldLabel>{label}</FieldLabel>
      {hint && <FieldDescription>{hint}</FieldDescription>}
      <Input
        type={input.type ?? "text"}
        value={input.value}
        autoComplete={input.autoComplete}
        inputMode={input.inputMode}
        maxLength={input.maxLength}
        spellCheck={false}
        onChange={(event) => input.onChange(event.target.value)}
      />
      <FieldError>{error}</FieldError>
    </Field>
  );
}

/** For a sign-in that's partway: leave instead of finishing it. */
export function SignOutLink() {
  return (
    <button type="button" className={`text-body-sm self-start ${linkClass}`} onClick={signOut}>
      {t("auth.signOutInstead")}
    </button>
  );
}

/** Back to Sign in, from a link that can't be used or a reset that's done. */
export function ToSignIn({ primary }: { primary?: boolean }) {
  return (
    <Button
      variant={primary ? "primary-fill" : "default-outline"}
      // oxlint-disable-next-line jsx-a11y/control-has-associated-label -- labelled by the Button's children
      render={<a href="/admin/sign-in" />}
    >
      {t("auth.link.toSignIn")}
    </Button>
  );
}
