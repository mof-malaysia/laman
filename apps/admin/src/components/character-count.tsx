/**
 * FTDS CharacterCount in the admin's language: the ui component writes its
 * count in English, so the admin imports this one instead.
 */
import { forwardRef } from "react";
import {
  CharacterCount as FtdsCharacterCount,
  type CharacterCountMessageState,
  type CharacterCountProps,
} from "@/components/ui/character-count";
import { t } from "@/i18n";

const formatMessage = ({ remaining, countBy }: CharacterCountMessageState) => {
  const unit = countBy === "words" ? "words" : "chars";
  return remaining >= 0
    ? t(`count.${unit}.remaining`, { count: remaining })
    : t(`count.${unit}.over`, { count: -remaining });
};

const overLimitMessage = ({ limit, countBy }: CharacterCountMessageState) =>
  t(countBy === "words" ? "count.words.limit" : "count.chars.limit", { limit });

export const CharacterCount = forwardRef<HTMLTextAreaElement, CharacterCountProps>((props, ref) => (
  <FtdsCharacterCount
    ref={ref}
    formatMessage={formatMessage}
    overLimitMessage={overLimitMessage}
    {...props}
  />
));
CharacterCount.displayName = "CharacterCount";
