"use client";

import CopyToClipboard from "@cloudscape-design/components/copy-to-clipboard";
import { useRouter } from "next/navigation";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

function textOf(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in node) return textOf((node as { props: { children?: React.ReactNode } }).props.children);
  return "";
}

/** Renders an assistant answer. Raw HTML in the text is not rendered (react-markdown escapes it). */
export function Markdown({ text }: { text: string }) {
  const router = useRouter();
  const components: Components = {
    a: ({ href = "", children }) =>
      href.startsWith("/") ? (
        <a
          href={href}
          onClick={(e) => {
            e.preventDefault();
            router.push(href);
          }}
        >
          {children}
        </a>
      ) : /^https?:\/\//.test(href) ? (
        <a href={href} target="_blank" rel="noopener noreferrer nofollow">
          {children}
        </a>
      ) : (
        <span>{children}</span>
      ),
    pre: ({ children }) => {
      const code = textOf(children).replace(/\n$/, "");
      return (
        <div className="q-code">
          <div className="q-code-copy">
            <CopyToClipboard variant="icon" textToCopy={code} copyButtonAriaLabel="Copy code" copySuccessText="Code copied" copyErrorText="Code could not be copied" />
          </div>
          <pre>{children}</pre>
        </div>
      );
    },
    table: ({ children }) => (
      <div className="q-table">
        <table>{children}</table>
      </div>
    ),
    img: () => null,
  };
  return (
    <div className="q-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {text}
      </ReactMarkdown>
    </div>
  );
}
