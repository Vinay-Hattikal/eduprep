"use client";

// Code editor (CodeMirror 6, D-035): small, fast on phones, accessible, themeable.

import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { useTheme } from "next-themes";
import { useMemo } from "react";
import type { CodingLanguage } from "@/lib/coding/languages";

const LANGUAGE_EXTENSIONS = {
  c: () => cpp(),
  cpp: () => cpp(),
  java: () => java(),
  python: () => python(),
  javascript: () => javascript(),
} satisfies Record<CodingLanguage, () => unknown>;

const baseTheme = EditorView.theme({
  "&": { fontSize: "14px" },
  ".cm-content": { fontFamily: "var(--font-mono), ui-monospace, monospace" },
  ".cm-gutters": { fontFamily: "var(--font-mono), ui-monospace, monospace" },
  "&.cm-focused": { outline: "none" },
});

export function CodeEditor({
  value,
  onChange,
  language,
  height = "420px",
  label,
  readOnly = false,
}: {
  value: string;
  onChange?: (value: string) => void;
  language: CodingLanguage;
  height?: string;
  label: string;
  readOnly?: boolean;
}) {
  const { resolvedTheme } = useTheme();
  const extensions = useMemo(
    () => [
      LANGUAGE_EXTENSIONS[language](),
      baseTheme,
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ "aria-label": label }),
    ],
    [language, label],
  );
  return (
    <div
      className="overflow-hidden rounded-lg border bg-card focus-within:ring-3 focus-within:ring-ring/50"
      data-testid="code-editor"
    >
      <CodeMirror
        value={value}
        onChange={onChange}
        height={height}
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        extensions={extensions as never}
        readOnly={readOnly}
        basicSetup={{ tabSize: 4, foldGutter: false, highlightActiveLine: !readOnly }}
        indentWithTab
      />
    </div>
  );
}
