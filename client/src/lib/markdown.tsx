import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Renders markdown content with GitHub-flavored-markdown support. */
export function Markdown({ content }: { content: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
