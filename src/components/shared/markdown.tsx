import "katex/dist/katex.min.css";

import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { cn } from "@/lib/utils";

type MarkdownProps = {
  children: string;
  className?: string;
};

/**
 * Renders content Markdown: GFM tables, LaTeX math ($...$, $$...$$) and highlighted code.
 * Raw HTML in the source is NOT rendered (react-markdown default), so author content can't inject markup.
 */
export function Markdown({ children, className }: MarkdownProps) {
  return (
    <div
      className={cn(
        "space-y-3 text-[1.0625rem] leading-relaxed break-words",
        "[&_a]:font-medium [&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline",
        "[&_ol]:list-decimal [&_ol]:pl-6 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-6",
        "[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[0.9em]",
        "[&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:bg-surface [&_pre]:p-4 [&_pre]:font-mono [&_pre]:text-sm [&_pre]:leading-normal",
        "[&_table]:w-full [&_table]:border-collapse [&_table]:text-sm [&_td]:border [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:bg-surface [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium",
        "[&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:py-1",
        "[&_blockquote]:border-l-4 [&_blockquote]:border-primary/40 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground",
        "[&_img]:max-w-full [&_img]:rounded-lg",
        className,
      )}
    >
      <ReactMarkdown
        // remark-breaks: a line break in a CSV cell stays a line break (authors expect this).
        remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
        rehypePlugins={[rehypeKatex, [rehypeHighlight, { detect: false }]]}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
