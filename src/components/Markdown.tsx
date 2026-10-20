import DOMPurify from 'dompurify';
import { marked } from 'marked';

// Links from Claude's answers open in a new tab instead of replacing the app.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noreferrer');
  }
});

export function Markdown({ text }: { text: string }) {
  const html = DOMPurify.sanitize(marked.parse(text, { async: false, breaks: true }));
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />;
}
