"use client";

import { useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

// A fenced code block with a copy button. Copies the rendered text so it works
// regardless of language/highlighting.
function CodeBlock({ children }: { children?: ReactNode }) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  function copy() {
    const text = ref.current?.innerText ?? "";
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  }
  return (
    <div className="md-code">
      <button onClick={copy} className="md-copy" type="button">
        {copied ? "copied" : "copy"}
      </button>
      <pre ref={ref}>{children}</pre>
    </div>
  );
}

// Renders model output as GitHub-flavoured markdown with offline syntax
// highlighting. Raw HTML is not rendered (no rehype-raw), so model output can't
// inject markup.
export function Markdown({ content }: { content: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre: (props) => <CodeBlock>{props.children}</CodeBlock>,
          a: (props) => <a {...props} target="_blank" rel="noreferrer" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
