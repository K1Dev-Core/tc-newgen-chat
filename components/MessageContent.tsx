import { CodeBlock } from './CodeBlock';

type MessagePart =
  | { type: 'text'; value: string }
  | { type: 'code'; language: string; value: string };

function splitMessage(content: string): MessagePart[] {
  const parts: MessagePart[] = [];
  const fencedBlock = /(^|\n)(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)\n\2[ \t]*(?=\n|$)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = fencedBlock.exec(content)) !== null) {
    const contentStart = match.index + match[1].length;
    if (contentStart > cursor) parts.push({ type: 'text', value: content.slice(cursor, contentStart) });
    const language = match[3].trim().split(/\s+/)[0] ?? '';
    parts.push({ type: 'code', language, value: match[4] });
    cursor = match.index + match[0].length;
  }

  if (cursor < content.length) parts.push({ type: 'text', value: content.slice(cursor) });
  return parts.length ? parts : [{ type: 'text', value: content }];
}

export function MessageContent({ content }: { content: string }) {
  return <div className="group-message-bubble message-content">
    {splitMessage(content).map((part, index) => part.type === 'code'
      ? <CodeBlock key={`code-${index}`} code={part.value} language={part.language} />
      : part.value
        ? <p className="message-text" key={`text-${index}`}>{part.value}</p>
        : null)}
  </div>;
}
