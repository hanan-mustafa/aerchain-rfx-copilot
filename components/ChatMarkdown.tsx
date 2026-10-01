"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders the analyst's markdown reply (tables, headings, bold, lists) as
 * formatted chat content instead of raw markup. Raw HTML in the reply is not
 * rendered (react-markdown's default), so model output can't inject markup.
 * Styling lives under .chat-md in app/globals.css.
 */
export function ChatMarkdown({ text }: { text: string }) {
  return (
    <div className="chat-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // The chat panel is narrow: wide comparison tables scroll sideways
          // inside the bubble rather than stretching the layout.
          table: ({ node, ...props }) => (
            <div className="chat-md-table">
              <table {...props} />
            </div>
          ),
          a: ({ node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
