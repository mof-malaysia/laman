/**
 * Setting up two-factor: scan the QR code (or type the secret), confirm one
 * code, then keep the recovery codes, which are shown only this once. Used
 * at sign-in when the site requires it, and from Account.
 */
import type { Me } from "@fiscal-sb/contracts";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { encode } from "uqr";
import { Button } from "@/components/ui/button";
import { Callout, CalloutContent, CalloutTitle } from "@/components/ui/callout";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldItem, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { authApi } from "@/lib/auth";
import { useAction } from "@/lib/use-action";
import { AuthField, AuthForm } from "./frame";

/** The otpauth:// address as a QR code, drawn as squares: no image to load. */
function QrCode({ text }: { text: string }) {
  const { data, size } = encode(text, { border: 2 });
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="bg-bg-white size-44 rounded-md"
      shapeRendering="crispEdges"
    >
      <title>{t("auth.enrol.qr")}</title>
      {data.flatMap((row, y) =>
        row.map((on, x) =>
          on ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} /> : null,
        ),
      )}
    </svg>
  );
}

/** "ABCD EFGH IJKL …": easier to type into an app than one long string. */
const grouped = (secret: string) => secret.match(/.{1,4}/g)?.join(" ") ?? secret;

export function TwoFactorSetup({ onDone }: { onDone: (me: Me) => void }) {
  // One secret per visit: a second request would make the QR code shown stale.
  const setup = useQuery({
    queryKey: ["totp-setup"],
    queryFn: authApi.setup,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });
  const [code, setCode] = useState("");
  const enrol = useAction();
  const [done, setDone] = useState<{ me: Me; codes: string[] }>();

  if (done) return <RecoveryCodes codes={done.codes} onContinue={() => onDone(done.me)} />;
  if (setup.isError)
    return (
      <Callout variant="danger">
        <CalloutTitle>{t("auth.enrol.failed")}</CalloutTitle>
      </Callout>
    );
  if (!setup.data) return <Skeleton className="h-72 w-full" />;

  return (
    <div className="gap-stack-md flex flex-col">
      <ol className="text-body-sm text-txt-black-700 list-decimal space-y-1 pl-5">
        <li>{t("auth.enrol.step1")}</li>
        <li>{t("auth.enrol.step2")}</li>
        <li>{t("auth.enrol.step3")}</li>
      </ol>
      <div className="border-otl-gray-200 flex flex-col items-center gap-3 rounded-md border p-4">
        <QrCode text={setup.data.uri} />
        <div className="text-center">
          <p className="text-label-compact text-txt-black-700">{t("auth.enrol.typeInstead")}</p>
          <code className="text-body-sm text-txt-black-900 font-mono tracking-wide break-all">
            {grouped(setup.data.secret)}
          </code>
        </div>
      </div>
      <AuthForm
        submit={t("auth.enrol.submit")}
        pending={enrol.pending}
        error={enrol.error}
        onSubmit={() => void enrol.run(() => authApi.enrol(code), setDone)}
      >
        <AuthField
          name="code"
          label={t("auth.enrol.code")}
          autoComplete="one-time-code"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={(value) => setCode(value.replace(/\D/g, ""))}
        />
      </AuthForm>
    </div>
  );
}

/** The recovery codes, once: to print, download or copy, before going on. */
export function RecoveryCodes({ codes, onContinue }: { codes: string[]; onContinue: () => void }) {
  const [kept, setKept] = useState(false);
  const text = `${t("auth.recovery.fileTitle")}\n\n${codes.join("\n")}\n`;
  return (
    <div className="gap-stack-md flex flex-col">
      <Callout variant="warning">
        <CalloutTitle>{t("auth.recovery.title")}</CalloutTitle>
        <CalloutContent>{t("auth.recovery.body")}</CalloutContent>
      </Callout>
      <ul className="border-otl-gray-200 bg-bg-washed grid grid-cols-2 gap-x-6 gap-y-1 rounded-md border p-4 font-mono">
        {codes.map((code) => (
          <li key={code} className="text-body-sm text-txt-black-900 tracking-wide">
            {code}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="default-outline"
          size="small"
          onClick={() => {
            const link = document.createElement("a");
            link.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
            link.download = "recovery-codes.txt";
            link.click();
            URL.revokeObjectURL(link.href);
          }}
        >
          {t("auth.recovery.download")}
        </Button>
        <Button
          variant="default-outline"
          size="small"
          onClick={() => void navigator.clipboard.writeText(text)}
        >
          {t("auth.recovery.copy")}
        </Button>
      </div>
      <Field name="kept">
        <FieldItem>
          <Checkbox checked={kept} onCheckedChange={setKept} />
          <FieldLabel>{t("auth.recovery.kept")}</FieldLabel>
        </FieldItem>
      </Field>
      <Button variant="primary-fill" disabled={!kept} onClick={onContinue}>
        {t("auth.recovery.continue")}
      </Button>
    </div>
  );
}
