import type { AiProvider } from './provider.js';
import { parseJsonReply } from './provider.js';

/** Prompts are kept short and specific; outputs are validated before reaching the UI. */

const BREAKDOWN_SYSTEM = `You are a pragmatic productivity coach inside the Trackly app.
Break the user's task into 3-7 concrete, actionable subtasks. Each subtask starts with a verb,
is at most 70 characters, and can be done in one sitting. Do not number them.
Respond as JSON: {"subtasks": ["...", "..."]}`;

export async function breakDownTask(ai: AiProvider, title: string, description?: string): Promise<string[]> {
  const prompt = `Task: ${title}${description ? `\nDetails: ${description}` : ''}`;
  const reply = await ai.complete({ system: BREAKDOWN_SYSTEM, prompt, maxTokens: 400, temperature: 0.4, json: true });
  const parsed = parseJsonReply<{ subtasks?: unknown }>(reply);
  if (!Array.isArray(parsed.subtasks)) return [];
  return parsed.subtasks
    .map((s) => String(s).replace(/^[-*\d.)\s]+/, '').trim())
    .filter((s) => s.length > 0)
    .map((s) => (s.length > 120 ? `${s.slice(0, 117)}...` : s))
    .slice(0, 7);
}

const REVIEW_SYSTEM = `You are an encouraging but honest productivity coach inside the Trackly app.
Given a user's weekly statistics as JSON, write a short weekly review in second person:
2 short paragraphs, max 130 words total. Mention one specific win, one pattern worth changing,
and one concrete suggestion for next week. No headings, no bullet points, no emojis, plain text.`;

export async function summariseWeek(ai: AiProvider, stats: unknown): Promise<string> {
  const reply = await ai.complete({
    system: REVIEW_SYSTEM,
    prompt: JSON.stringify(stats),
    maxTokens: 350,
    temperature: 0.7,
  });
  return reply.trim().slice(0, 1500);
}
