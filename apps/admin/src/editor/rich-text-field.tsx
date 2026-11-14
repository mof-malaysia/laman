/**
 * Rich text in the property panel: Tiptap, limited to what the block schema
 * stores (headings 2–3, paragraphs, lists, quotes, bold, italic, links).
 */
import type { RichText } from "@laman/blocks";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { type ReactNode, useEffect } from "react";
import { BoldIcon } from "@/components/ui/icons/bold";
import { BulletedListIcon } from "@/components/ui/icons/bulleted-list";
import { ItalicIcon } from "@/components/ui/icons/italic";
import { LinkIcon } from "@/components/ui/icons/link";
import { NumberedListIcon } from "@/components/ui/icons/numbered-list";
import { UnlinkIcon } from "@/components/ui/icons/unlink";
import { Toggle } from "@/components/ui/toggle";
import { Toolbar, ToolbarButton, ToolbarSeparator } from "@/components/ui/toolbar";
import { t } from "@/i18n";

type RichTextFieldProps = {
  id: string;
  value: RichText;
  onChange: (value: RichText) => void;
};

const extensions = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    code: false,
    codeBlock: false,
    horizontalRule: false,
    strike: false,
    underline: false,
    link: { openOnClick: false, autolink: false, protocols: ["mailto"] },
  }),
];

export function RichTextField({ id, value, onChange }: RichTextFieldProps) {
  const editor = useEditor({
    extensions,
    content: value,
    editorProps: {
      attributes: {
        id,
        class:
          "min-h-40 rounded-md bg-bg-white px-3 py-2 text-body-sm outline-none focus-visible:ring focus-visible:ring-fr-primary [&_h2]:text-title [&_h2]:font-semibold [&_h3]:font-semibold [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_a]:text-txt-primary [&_a]:underline [&_blockquote]:bg-bg-washed [&_blockquote]:px-3 [&>*+*]:mt-2",
      },
    },
    onUpdate: ({ editor: current }) => onChange(current.getJSON() as RichText),
  });

  // Undo and redo change the value from outside; follow them.
  useEffect(() => {
    if (editor && JSON.stringify(editor.getJSON()) !== JSON.stringify(value))
      editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current?.isActive("bold") ?? false,
      italic: current?.isActive("italic") ?? false,
      h2: current?.isActive("heading", { level: 2 }) ?? false,
      h3: current?.isActive("heading", { level: 3 }) ?? false,
      bullet: current?.isActive("bulletList") ?? false,
      ordered: current?.isActive("orderedList") ?? false,
      link: current?.isActive("link") ?? false,
    }),
  });

  if (!editor) return null;
  const chain = () => editor.chain().focus();

  const setLink = () => {
    const previous = (editor.getAttributes("link").href as string | undefined) ?? "";
    // oxlint-disable-next-line no-alert -- a proper link dialog comes with the full editor
    const href = window.prompt(t("editor.richText.linkPrompt"), previous);
    if (href === null) return;
    if (href === "") chain().unsetLink().run();
    else chain().extendMarkRange("link").setLink({ href }).run();
  };

  return (
    <div className="bg-bg-washed flex flex-col gap-1 rounded-md p-1">
      <Toolbar aria-label={t("editor.richText.toolbar")}>
        <Mark
          label={t("editor.richText.h2")}
          pressed={state?.h2}
          onPress={() => chain().toggleHeading({ level: 2 }).run()}
        >
          H2
        </Mark>
        <Mark
          label={t("editor.richText.h3")}
          pressed={state?.h3}
          onPress={() => chain().toggleHeading({ level: 3 }).run()}
        >
          H3
        </Mark>
        <ToolbarSeparator />
        <Mark
          label={t("editor.richText.bold")}
          pressed={state?.bold}
          onPress={() => chain().toggleBold().run()}
        >
          <BoldIcon />
        </Mark>
        <Mark
          label={t("editor.richText.italic")}
          pressed={state?.italic}
          onPress={() => chain().toggleItalic().run()}
        >
          <ItalicIcon />
        </Mark>
        <Mark label={t("editor.richText.link")} pressed={state?.link} onPress={setLink}>
          {state?.link ? <UnlinkIcon /> : <LinkIcon />}
        </Mark>
        <ToolbarSeparator />
        <Mark
          label={t("editor.richText.bullet")}
          pressed={state?.bullet}
          onPress={() => chain().toggleBulletList().run()}
        >
          <BulletedListIcon />
        </Mark>
        <Mark
          label={t("editor.richText.ordered")}
          pressed={state?.ordered}
          onPress={() => chain().toggleOrderedList().run()}
        >
          <NumberedListIcon />
        </Mark>
      </Toolbar>
      <EditorContent editor={editor} />
    </div>
  );
}

type MarkProps = {
  label: string;
  pressed: boolean | undefined;
  onPress: () => void;
  children: ReactNode;
};

/** A toolbar toggle that shows whether its format applies at the cursor. */
function Mark({ label, pressed, onPress, children }: MarkProps) {
  return (
    <ToolbarButton
      render={
        <Toggle
          pressed={pressed ?? false}
          onPressedChange={onPress}
          size="small"
          iconOnly
          aria-label={label}
        />
      }
    >
      {children}
    </ToolbarButton>
  );
}
