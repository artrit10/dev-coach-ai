import type { ReactNode } from "react";

// Renders the small slice of Markdown the AI uses: code fences, `inline code` and **bold**.
// Built from React elements, never from HTML strings, so model output cannot inject markup.
function renderInline(text: string): ReactNode[] {
  return text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g).map((part, i) => {
    if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    return part;
  });
}

export function RichText({ text }: { text: string }) {
  // Splitting on a capture group alternates plain text and fenced code.
  const parts = text.split(/```[^\n`]*\n([\s\S]*?)```/g);
  return (
    <div className="rich">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <pre key={i} className="code-block">
            <code>{part.replace(/\n$/, "")}</code>
          </pre>
        ) : (
          part.trim() && <p key={i}>{renderInline(part.trim())}</p>
        ),
      )}
    </div>
  );
}
