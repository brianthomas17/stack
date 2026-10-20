import type { Chat, Item, Learnings } from '../shared/types.ts';
import { askClaude } from './claude.ts';
import { describe } from './research.ts';
import * as store from './store.ts';

// Each message is a fresh `claude -p` call with the conversation replayed in the
// prompt. No hidden session state: the chat file is the whole truth.

const HISTORY_LIMIT = 30;

function context(item: Item, chat: Chat, stack: Item[]) {
  const r = item.research;
  return [
    'You are a knowledgeable, plain-spoken guide helping someone understand a supplement or medication in their daily stack.',
    'Teach: explain mechanisms, evidence quality, dosing, timing, interactions and trade-offs. Be concise and conversational; use short paragraphs or bullets.',
    'Search the web when a question depends on current or specific facts, and cite links when you do.',
    'This is education, not medical advice. Never tell them to stop or change a prescription; suggest raising it with their doctor.',
    '',
    'The item:',
    describe(item),
    r && `\nPrevious research verdict: ${r.verdict}\nSummary: ${r.summary}\nTypical dose: ${r.typicalDose}\nTheir dose: ${r.doseAssessment}` +
      (r.redFlags.length ? `\nRed flags found: ${r.redFlags.map((f) => `${f.title} (${f.severity})`).join('; ')}` : ''),
    item.testing.status !== 'unknown' && `Third-party testing: ${item.testing.status}${item.testing.certifications.length ? ` (${item.testing.certifications.join(', ')})` : ''}`,
    stack.length > 0 && `\nThe rest of their active stack: ${stack.map((i) => [i.name, i.dose, i.timing.join('/').toUpperCase()].filter(Boolean).join(', ')).join('; ')}`,
    chat.learnings && `\nWhat they've learned so far: ${chat.learnings.summary}\n${chat.learnings.takeaways.map((t) => `- ${t}`).join('\n')}`,
  ].filter(Boolean).join('\n');
}

function transcript(chat: Chat) {
  return chat.messages.slice(-HISTORY_LIMIT)
    .map((m) => `${m.role === 'user' ? 'Them' : 'You'}: ${m.text}`)
    .join('\n\n');
}

const learningsSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    takeaways: { type: 'array', items: { type: 'string' } },
    openQuestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'takeaways', 'openQuestions'],
};

async function refreshLearnings(item: Item, chat: Chat): Promise<Learnings> {
  const prev = chat.learnings;
  const { structured } = await askClaude(
    `Update the running notes on what this person has learned about ${item.name} from their conversations.

${prev ? `Current notes:\nSummary: ${prev.summary}\nTakeaways:\n${prev.takeaways.map((t) => `- ${t}`).join('\n')}\nOpen questions:\n${prev.openQuestions.map((t) => `- ${t}`).join('\n')}\n` : 'There are no notes yet.\n'}
Recent conversation:
${transcript(chat)}

Return, written to them in the second person ("you"):
- summary: one sentence on where their understanding stands.
- takeaways: the distinct, useful things they now know, at most 5, each under 15 words. Merge with existing takeaways, combine overlapping ones, drop superseded ones. Fewer is better; one exchange is usually one or two takeaways.
- openQuestions: only questions they actually asked that are still unresolved, at most 2. Usually empty.`,
    { schema: learningsSchema, model: process.env.STACK_SUMMARY_MODEL ?? 'haiku' },
  );
  return { ...(structured as Omit<Learnings, 'updatedAt'>), updatedAt: new Date().toISOString() };
}

// One reply at a time per item, so two quick sends can't interleave.
const inFlight = new Set<string>();

export async function sendMessage(item: Item, text: string): Promise<Chat> {
  if (inFlight.has(item.id)) throw new Error('Claude is still answering the last message');
  const chat = await store.getChat(item.id);
  chat.messages.push({ role: 'user', text, at: new Date().toISOString() });
  chat.pending = true;
  delete chat.error;
  await store.saveChat(chat);
  inFlight.add(item.id);
  void reply(item);
  return chat;
}

async function reply(item: Item) {
  let chat = await store.getChat(item.id);
  const stack = (await store.listItems()).filter((i) => i.status === 'active' && i.id !== item.id);
  try {
    const { text } = await askClaude(
      `Conversation so far:\n\n${transcript(chat)}\n\nReply to their latest message.`,
      {
        systemPrompt: context(item, chat, stack),
        tools: ['WebSearch', 'WebFetch'],
        model: process.env.STACK_CHAT_MODEL,
      },
    );
    chat = await store.getChat(item.id);
    chat.messages.push({ role: 'assistant', text: text.trim(), at: new Date().toISOString() });
    chat.pending = false;
    chat.summarizing = true;
    await store.saveChat(chat);
  } catch (e) {
    chat = await store.getChat(item.id);
    chat.pending = false;
    chat.error = e instanceof Error ? e.message : String(e);
    await store.saveChat(chat);
    return;
  } finally {
    inFlight.delete(item.id);
  }

  try {
    const learnings = await refreshLearnings(item, chat);
    chat = await store.getChat(item.id);
    chat.learnings = learnings;
  } catch (e) {
    console.error('Learnings refresh failed:', e);
    chat = await store.getChat(item.id);
  }
  chat.summarizing = false;
  await store.saveChat(chat);
}

/** Clears the conversation but keeps what you've learned. */
export async function clearChat(itemId: string) {
  const chat = await store.getChat(itemId);
  if (inFlight.has(itemId)) throw new Error('Wait for Claude to finish replying');
  await store.saveChat({ itemId, messages: [], learnings: chat.learnings });
}

/** A crash mid-reply leaves pending set forever; clear it on startup. */
export async function resetStuckChats(itemIds: string[]) {
  for (const id of itemIds) {
    const chat = await store.getChat(id);
    if (chat.pending || chat.summarizing) {
      await store.saveChat({
        ...chat,
        pending: false,
        summarizing: false,
        error: chat.pending ? 'The server restarted before Claude replied. Send it again.' : chat.error,
      });
    }
  }
}
