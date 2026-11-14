/**
 * A screen's Help: a ghost button that opens a right-hand drawer of questions,
 * each answer folded under its question. Anything a screen needs above the
 * questions, such as commands to copy, goes in `children`.
 */
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Details, DetailsContent, DetailsTrigger } from "@/components/ui/details";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { QuestionCircleIcon } from "@/components/ui/icons/question-circle";
import { type MessageKey, t } from "@/i18n";
import { clx } from "@/lib/ftds/utils";

export type HelpQuestions = readonly (readonly [MessageKey, MessageKey])[];

export function HelpButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <Button
      variant="default-ghost"
      size="small"
      className={className}
      aria-haspopup="dialog"
      onClick={onClick}
    >
      <QuestionCircleIcon aria-hidden className="size-4" />
      {t("help.button")}
    </Button>
  );
}

export function HelpDrawer({
  open,
  onOpenChange,
  title,
  questions,
  questionsTitle,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  questions: HelpQuestions;
  /** A heading over the questions, when `children` come first. */
  questionsTitle?: string;
  children?: ReactNode;
}) {
  const list = (
    <ul className="divide-otl-gray-200 m-0 flex list-none flex-col divide-y p-0">
      {questions.map(([question, answer]) => (
        <li key={question} className="py-3 first:pt-0">
          <Details>
            <DetailsTrigger>{t(question)}</DetailsTrigger>
            <DetailsContent>
              <p className="text-body-sm text-txt-black-700 m-0">{t(answer)}</p>
            </DetailsContent>
          </Details>
        </li>
      ))}
    </ul>
  );
  return (
    <Drawer side="right" open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="w-full sm:max-w-md">
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
        </DrawerHeader>
        <DrawerBody className={clx(children && "gap-stack-lg flex flex-col")}>
          {children}
          {questionsTitle ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-body-md text-txt-black-900 m-0 font-semibold">
                {questionsTitle}
              </h3>
              {list}
            </section>
          ) : (
            list
          )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
