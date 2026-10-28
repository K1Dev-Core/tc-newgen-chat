'use client';

import { DragEvent, KeyboardEvent, ClipboardEvent, useMemo, useRef, useState } from 'react';
import { File as FileIcon, LoaderCircle, Paperclip, Search, Send, Volume2, X } from 'lucide-react';
import hljs from 'highlight.js';
import { formatFileSize, type ChatFileAttachment } from '@/lib/chat-files';
import { SFX_CATALOG, type RemoteSfxItem } from '@/lib/sfx-catalog';

function detectCodeLanguage(text: string): string | null {
  const source = text.trim();
  if (!source || /^\s*(`{3,}|~{3,})/.test(source)) return null;

  try {
    JSON.parse(source);
    if (/^(?:\{|\[)/.test(source)) return 'json';
  } catch {
    // Continue with syntax detection for non-JSON text.
  }

  const hasHtmlTag = /<[^>]+>/.test(source);
  const hasCallExpression = /^\s*(?:await\s+)?(?:new\s+)?[A-Za-z_$][\w$]*(?:\.[\w$]+)*\s*\([^)]*\)\s*;?\s*$/.test(source);
  const hasStrongCodeSyntax = hasHtmlTag || hasCallExpression || /(?:=>|===?|!==?|&&|\|\||->|::|\b\w+\s*\([^\n]*\)\s*\{|^\s*(?:#!|#include\b|import\s+[\w{*]|from\s+[\w.]+\s+import\b|export\s+(?:default|const|function|class|type|interface)\b|(?:const|let|var)\s+[$\w]+\s*(?:=|:)|function\s+[$\w]+\s*\(|class\s+[$\w]+\b|def\s+\w+\s*\(|async\s+function\b|SELECT\b.+\bFROM\b|INSERT\s+INTO\b|CREATE\s+TABLE\b|UPDATE\s+\w+\s+SET\b|fn\s+\w+\s*\(|func\s+\w+\s*\(|package\s+\w+|use\s+[\w:]+;))/mi.test(source);
  const lines = source.split('\n');
  const codeShapedLines = lines.filter((line) => /^\s{2,}\S/.test(line)
    || /[{};]$/.test(line.trim())
    || /^\s*(?:if|else|for|while|switch|case|try|catch|return|break|continue)\b.*(?:\{|:|;)?\s*$/.test(line)).length;
  const hasSeveralCodeLines = lines.length >= 2 && codeShapedLines >= 2;
  if (!hasStrongCodeSyntax && !hasSeveralCodeLines) return null;

  const result = hljs.highlightAuto(source);
  return result.language && result.relevance >= 2 ? result.language : '';
}

function formatDetectedCode(text: string): string {
  const language = detectCodeLanguage(text);
  return language === null ? text : `\`\`\`${language}\n${text}\n\`\`\``;
}

export function Composer({ canSend, sending, onOpenJoin, onSend, onUploadFile, onNotify, onTyping, onPlaySfx }: {
  canSend: boolean;
  sending: boolean;
  onOpenJoin: () => void;
  onSend: (text: string, files: ChatFileAttachment[]) => Promise<boolean>;
  onUploadFile: (file: File, onProgress: (percentage: number) => void) => Promise<ChatFileAttachment>;
  onNotify: (message: string) => void;
  onTyping: (isTyping: boolean) => void;
  onPlaySfx: (item: RemoteSfxItem) => void;
}) {
  const [value, setValue] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ filename: string; percentage: number } | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [sfxOpen, setSfxOpen] = useState(false);
  const [sfxSearch, setSfxSearch] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = sending || uploading;
  const visibleSfx = useMemo(() => {
    const query = sfxSearch.trim().toLocaleLowerCase();
    return SFX_CATALOG.filter((item) => !query || `${item.name} ${item.id}`.toLocaleLowerCase().includes(query)).slice(0, 100);
  }, [sfxSearch]);

  function addFiles(fileList: FileList | File[]) {
    if (!canSend || !fileList.length) return;
    setFiles((current) => [...current, ...Array.from(fileList)]);
  }

  async function submitMessage() {
    if (!canSend || busy || (!value.trim() && !files.length)) return;
    const message = value.trim();
    const formattedMessage = formatDetectedCode(message);
    if (new TextEncoder().encode(formattedMessage).byteLength > 180000) {
      onNotify('ข้อความและโค้ดต้องมีขนาดไม่เกิน 180 KB');
      return;
    }
    onTyping(false);
    setUploading(Boolean(files.length));
    const uploadedFiles: ChatFileAttachment[] = [];
    try {
      for (const file of files) {
        setUploadProgress({ filename: file.name, percentage: 0 });
        uploadedFiles.push(await onUploadFile(file, (percentage) => setUploadProgress({ filename: file.name, percentage })));
      }
      setUploadProgress(null);
      if (await onSend(formattedMessage, uploadedFiles)) {
        setValue('');
        setFiles([]);
        if (fileRef.current) fileRef.current.value = '';
      }
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'อัปโหลดไฟล์ไม่สำเร็จ ลองอีกครั้ง');
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submitMessage();
    }
  }

  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const pastedFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (!pastedFiles.length) return;
    event.preventDefault();
    addFiles(pastedFiles);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    addFiles(event.dataTransfer.files);
  }

  return <div className="composer-wrap">
    <div className={`composer ${dragActive ? 'composer-drag-active' : ''}`} onDragEnter={(event) => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDragActive(true); } }} onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false); }} onDrop={onDrop}>
      {dragActive && <div className="composer-drop-hint" aria-hidden="true">วางไฟล์เพื่อแนบในแชท</div>}
      {!canSend && <div className="chat-name-form">
        <div className="chat-join-prompt"><div><strong>เข้าร่วมแชทเพื่อส่งข้อความ</strong><small>เลือกชื่อและรูปโปรไฟล์ก่อนเริ่มคุยได้เลย</small></div><button type="button" className="chat-join-trigger" onClick={onOpenJoin}>เข้าร่วมแชท</button></div>
        <small>ยังไม่เข้าร่วมก็อ่านแชทได้ แต่ส่งข้อความไม่ได้</small>
      </div>}
      {files.length > 0 && <div className="composer-file-list" aria-label="ไฟล์ที่เลือก">
        {files.map((file, index) => <div className="composer-file-chip" key={`${file.name}-${file.lastModified}-${index}`} title={file.name}>
          <FileIcon size={14} /><span>{file.name}<small>{formatFileSize(file.size)}</small></span><button type="button" aria-label={`เอา ${file.name} ออก`} disabled={busy} onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={13} /></button>
        </div>)}
      </div>}
      {uploadProgress && <div className="composer-upload-progress" role="status"><span>กำลังอัปโหลด {uploadProgress.filename} · {uploadProgress.percentage}%</span><progress max="100" value={uploadProgress.percentage} /></div>}
      <div className="composer-main">
        <textarea aria-label="Message # นกพิราบสื่อสาร" disabled={!canSend || busy} value={value} onPaste={onPaste} onChange={(event) => {
          const nextValue = event.target.value;
          setValue(nextValue);
          onTyping(Boolean(nextValue.trim()));
        }} onBlur={() => onTyping(false)} onKeyDown={onKeyDown} placeholder={canSend ? 'ข้อความถึง # นกพิราบสื่อสาร' : 'เข้าร่วมแชทก่อนเพื่อส่งข้อความ'} rows={1} />
        <button className="send-button" aria-label={busy ? 'กำลังส่งไฟล์หรือข้อความ' : 'ส่งข้อความ'} title={busy ? 'กำลังส่งไฟล์หรือข้อความ' : 'ส่งข้อความ'} disabled={!canSend || (!value.trim() && !files.length) || busy} onClick={() => { void submitMessage(); }}>{busy ? <LoaderCircle className="send-spinner" size={17} strokeWidth={2} /> : <Send size={18} strokeWidth={1.8} />}</button>
      </div>
      <div className="composer-footer">
        <div className="sfx-picker">
          <button type="button" className="sfx-trigger" aria-label="เปิดคลังเสียง" title="เล่น SFX ให้ทุกคนในห้องได้ยิน" aria-expanded={sfxOpen} disabled={!canSend || busy} onClick={() => setSfxOpen((open) => !open)}><Volume2 size={16} /><span>SFX</span></button>
          {sfxOpen && <section className="sfx-menu" aria-label="คลังเสียง">
            <header className="sfx-menu-header"><div><strong>คลังเสียง</strong><small>กดเพื่อเล่นให้ทุกคนในห้อง</small></div><button type="button" aria-label="ปิดคลังเสียง" onClick={() => setSfxOpen(false)}><X size={15} /></button></header>
            <label className="sfx-search"><Search size={14} /><input autoFocus value={sfxSearch} onChange={(event) => setSfxSearch(event.target.value)} placeholder="ค้นหาเสียง…" /></label>
            <div className="sfx-list" role="listbox" aria-label="เสียงที่เลือกได้">
              {visibleSfx.map((item) => <button type="button" role="option" aria-selected="false" className="sfx-option" key={item.id} style={{ '--sfx-accent': item.color || '#6967a8' } as React.CSSProperties} title={`เล่น ${item.name} ให้ทั้งห้อง`} onClick={() => onPlaySfx(item)}>
                <span className="sfx-option-emoji">{item.emoji}</span><span className="sfx-option-name">{item.name}</span><Volume2 size={13} className="sfx-option-play" />
              </button>)}
              {visibleSfx.length === 0 && <p className="sfx-empty">ไม่พบเสียงที่ค้นหา</p>}
              {visibleSfx.length === 100 && <small className="sfx-limit">แสดง 100 รายการแรก พิมพ์ค้นหาเพื่อหาเสียงอื่น</small>}
            </div>
          </section>}
        </div>
        <button aria-label="แนบไฟล์" title="แนบไฟล์ (หรือวาง/ลากไฟล์ลงช่องแชท)" disabled={!canSend || busy} onClick={() => fileRef.current?.click()}><Paperclip size={16} /></button>
        <input ref={fileRef} type="file" hidden multiple onChange={(event) => { addFiles(event.target.files ?? []); event.target.value = ''; }} />
      </div>
    </div>
  </div>;
}
