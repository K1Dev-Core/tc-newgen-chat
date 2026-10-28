'use client';

import { useState } from 'react';
import hljs from 'highlight.js';
import { Check, Clipboard, ChevronDown, ChevronUp } from 'lucide-react';

const COLLAPSE_AFTER_LINES = 16;

export function CodeBlock({ code, language }: { code: string; language: string }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const requestedLanguage = language.trim().split(/\s+/)[0];
  const resolvedLanguage = requestedLanguage && hljs.getLanguage(requestedLanguage) ? requestedLanguage : undefined;
  const result = resolvedLanguage
    ? hljs.highlight(code, { language: resolvedLanguage, ignoreIllegals: true })
    : hljs.highlightAuto(code);
  const languageName = (resolvedLanguage ? hljs.getLanguage(resolvedLanguage)?.name : result.language) || 'ข้อความ';
  const lineCount = code.split('\n').length;
  const isLong = lineCount > COLLAPSE_AFTER_LINES || code.length > 1200;

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return <section className={`code-block${expanded ? ' code-block-expanded' : ''}`} aria-label={`${languageName} code block`}>
    <header className="code-block-header">
      <span className="code-language">{languageName}</span>
      <div className="code-block-actions">
        {isLong && <button type="button" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? 'ย่อโค้ด' : 'ดูโค้ดทั้งหมด'}>
          {expanded ? <><ChevronUp size={14} /> ย่อ</> : <><ChevronDown size={14} /> ดูทั้งหมด</>}
        </button>}
        <button type="button" onClick={copyCode} aria-label={copied ? 'คัดลอกแล้ว' : 'คัดลอกโค้ด'}>
          {copied ? <Check size={14} /> : <Clipboard size={14} />}
          {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
        </button>
      </div>
    </header>
    <pre className={`code-block-pre${isLong && !expanded ? ' code-block-collapsed' : ''}`}><code className={`hljs${result.language ? ` language-${result.language}` : ''}`} dangerouslySetInnerHTML={{ __html: result.value }} /></pre>
    {isLong && !expanded && <button type="button" className="code-block-expand" onClick={() => setExpanded(true)}>ดูโค้ดทั้งหมด ({lineCount} บรรทัด)</button>}
  </section>;
}
