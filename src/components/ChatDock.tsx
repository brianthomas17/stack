import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent } from 'react';
import type { Chat, Item } from '../../shared/types.ts';
import { api } from '../api.ts';
import { Markdown } from './Markdown.tsx';

interface Props {
  item: Item;
  chat?: Chat;
  setChat: (c: Chat) => void;
}

export interface ChatDockHandle {
  /** Expand the dock and put the cursor in the message box. */
  focus: () => void;
}

const STARTERS = [
  'Explain how this actually works in the body.',
  'How strong is the evidence, honestly?',
  "What's the best time and way to take it?",
  'Anything in the rest of my stack it interacts with?',
];

/** Chat pinned to the bottom of the item panel, so it's reachable from anywhere in it. */
export const ChatDock = forwardRef<ChatDockHandle, Props>(function ChatDock({ item, chat, setChat }, ref) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pending = chat?.pending ?? false;
  const messages = chat?.messages ?? [];

  useImperativeHandle(ref, () => ({
    focus: () => {
      setOpen(true);
      inputRef.current?.focus();
    },
  }));

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: 'end' });
  }, [open, messages.length, pending]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || pending) return;
    setError(null);
    setDraft('');
    setOpen(true);
    try {
      setChat(await api.sendChat(item.id, t));
    } catch (e) {
      setDraft(t);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(draft);
    }
    if (e.key === 'Escape' && open) setOpen(false);
  };

  const clear = async () => {
    if (!confirm("Clear this conversation? What you've learned stays.")) return;
    try {
      setChat(await api.clearChat(item.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className={`dock ${open ? 'open' : ''}`}>
      <div className="dock-head">
        <button className="dock-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span className="dock-title">Chat with Claude</span>
          {messages.length > 0 && <span className="muted small">{messages.length} messages</span>}
          {pending && <span className="dot running" />}
          <span className="dock-chevron" aria-hidden>{open ? '▾' : '▴'}</span>
        </button>
        {open && messages.length > 0 && (
          <button className="link small" onClick={clear} disabled={pending}>Clear</button>
        )}
      </div>

      {open && (
        <div className="dock-messages">
          {messages.length === 0 && !pending && (
            <div className="starters">
              <p className="muted small">Claude knows your dose, brand, research and the rest of your stack.</p>
              {STARTERS.map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              {m.role === 'assistant' ? <Markdown text={m.text} /> : m.text}
            </div>
          ))}
          {pending && <div className="msg assistant thinking">Claude is thinking<span className="dots" /></div>}
          <div ref={endRef} />
        </div>
      )}

      {(error || chat?.error) && <p className="error small dock-error">{error || chat?.error}</p>}

      <div className="composer">
        <textarea
          ref={inputRef}
          rows={1}
          value={draft}
          placeholder={pending ? 'Waiting for Claude…' : `Ask about ${item.name}…`}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onFocus={() => messages.length > 0 && setOpen(true)}
        />
        <button className="primary" disabled={pending || !draft.trim()} onClick={() => send(draft)}>Send</button>
      </div>
    </div>
  );
});
