import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Chat, Item } from '../../shared/types.ts';
import { api } from '../api.ts';
import { Markdown } from './Markdown.tsx';

interface Props {
  item: Item;
  chat?: Chat;
  setChat: (c: Chat) => void;
}

const STARTERS = [
  'Explain how this actually works in the body.',
  'How strong is the evidence, honestly?',
  "What's the best time and way to take it?",
  'Anything in the rest of my stack it interacts with?',
];

export function ChatView({ item, chat, setChat }: Props) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const pending = chat?.pending ?? false;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chat?.messages.length, pending]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || pending) return;
    setError(null);
    setDraft('');
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
  };

  const clear = async () => {
    if (!confirm('Clear this conversation? What you\'ve learned stays.')) return;
    try {
      setChat(await api.clearChat(item.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const messages = chat?.messages ?? [];
  return (
    <div className="chat">
      {messages.length === 0 && !pending && (
        <div className="starters">
          <p className="muted">Ask anything about {item.name}. Claude knows your dose, brand and research.</p>
          {STARTERS.map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}
        </div>
      )}

      <div className="messages">
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.role === 'assistant' ? <Markdown text={m.text} /> : m.text}
          </div>
        ))}
        {pending && <div className="msg assistant thinking">Claude is thinking<span className="dots" /></div>}
        <div ref={endRef} />
      </div>

      {(error || chat?.error) && <p className="error small">{error || chat?.error}</p>}

      <div className="composer">
        <textarea
          rows={2}
          value={draft}
          placeholder={pending ? 'Waiting for Claude…' : `Ask about ${item.name}…`}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
        />
        <button className="primary" disabled={pending || !draft.trim()} onClick={() => send(draft)}>Send</button>
      </div>
      {messages.length > 0 && (
        <button className="link small" onClick={clear} disabled={pending}>Clear conversation</button>
      )}
    </div>
  );
}
