import { describe, expect, it, vi } from 'vitest';
import { breakDownTask } from '../../src/ai/features.js';
import {
  anthropicProvider,
  createAiProvider,
  disabledProvider,
  geminiProvider,
  openAiCompatibleProvider,
  parseJsonReply,
} from '../../src/ai/provider.js';

function mockFetch(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch & {
    mock: { calls: [string, RequestInit][] };
  };
}

describe('AI providers', () => {
  it('is disabled by default and costs nothing', () => {
    const ai = createAiProvider({ AI_PROVIDER: 'none' });
    expect(ai.enabled).toBe(false);
    expect(ai).toBe(disabledProvider);
  });

  it('speaks the Gemini API', async () => {
    const fetchFn = mockFetch({ candidates: [{ content: { parts: [{ text: 'hello' }] } }] });
    const ai = geminiProvider('key-123', 'gemini-test', fetchFn);
    expect(await ai.complete({ system: 'sys', prompt: 'hi', json: true })).toBe('hello');
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toContain('/models/gemini-test:generateContent');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('key-123');
    expect(JSON.parse(String(init.body)).generationConfig.responseMimeType).toBe('application/json');
  });

  it('speaks any OpenAI-compatible API (Groq, OpenRouter, Ollama...)', async () => {
    const fetchFn = mockFetch({ choices: [{ message: { content: 'ok' } }] });
    const ai = openAiCompatibleProvider('k', 'llama-3', 'https://api.groq.com/openai/v1/', fetchFn);
    expect(await ai.complete({ system: 's', prompt: 'p' })).toBe('ok');
    expect(fetchFn.mock.calls[0]![0]).toBe('https://api.groq.com/openai/v1/chat/completions');
  });

  it('speaks the Anthropic Messages API', async () => {
    const fetchFn = mockFetch({ content: [{ type: 'text', text: 'claude says hi' }] });
    const ai = anthropicProvider('sk-ant', 'claude-test', fetchFn);
    expect(await ai.complete({ system: 's', prompt: 'p' })).toBe('claude says hi');
    const init = fetchFn.mock.calls[0]![1];
    expect((init.headers as Record<string, string>)['anthropic-version']).toBe('2023-06-01');
  });

  it('surfaces provider errors', async () => {
    const ai = openAiCompatibleProvider('k', 'm', 'https://x.test/v1', mockFetch({ error: 'quota' }, 429));
    await expect(ai.complete({ system: 's', prompt: 'p' })).rejects.toThrow(/429/);
  });
});

describe('AI features', () => {
  it('extracts JSON even when the model wraps it in prose', () => {
    expect(parseJsonReply<{ a: number }>('Sure! ```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it('cleans and caps task breakdowns', async () => {
    const fetchFn = mockFetch({
      choices: [{ message: { content: JSON.stringify({ subtasks: ['1. Draft outline', '- Write intro', '', ...Array(10).fill('Step')] }) } }],
    });
    const ai = openAiCompatibleProvider(undefined, 'm', 'http://localhost:11434/v1', fetchFn);
    const steps = await breakDownTask(ai, 'Write blog post');
    expect(steps[0]).toBe('Draft outline');
    expect(steps[1]).toBe('Write intro');
    expect(steps).toHaveLength(7);
  });
});
