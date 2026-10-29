import type { Config } from '../config.js';

/**
 * Provider-agnostic text generation. Trackly runs fully without AI (AI_PROVIDER=none, the
 * default and $0). Pointing it at a free tier (Gemini, Groq via the OpenAI-compatible API) or a
 * paid model (OpenAI, Anthropic Claude) is a configuration change, not a code change.
 */
export interface CompletionRequest {
  system: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  /** Ask the model for a JSON response (providers that support it get a native JSON mode). */
  json?: boolean;
}

export interface AiProvider {
  readonly name: string;
  readonly model: string | null;
  readonly enabled: boolean;
  complete(req: CompletionRequest): Promise<string>;
}

export class AiDisabledError extends Error {
  constructor() {
    super('AI is not configured');
  }
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export const disabledProvider: AiProvider = {
  name: 'none',
  model: null,
  enabled: false,
  complete: async () => {
    throw new AiDisabledError();
  },
};

type FetchFn = typeof fetch;
const TIMEOUT_MS = 25_000;

async function postJson(fetchFn: FetchFn, url: string, headers: Record<string, string>, body: unknown) {
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new AiProviderError(`AI provider returned ${res.status}: ${text.slice(0, 300)}`, res.status);
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new AiProviderError('AI provider returned invalid JSON');
  }
}

/** Google Gemini (has a free tier via Google AI Studio — no card needed). */
export function geminiProvider(apiKey: string, model = 'gemini-2.5-flash', fetchFn: FetchFn = fetch): AiProvider {
  return {
    name: 'gemini',
    model,
    enabled: true,
    async complete(req) {
      const data = await postJson(
        fetchFn,
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        { 'x-goog-api-key': apiKey },
        {
          systemInstruction: { parts: [{ text: req.system }] },
          contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
          generationConfig: {
            maxOutputTokens: req.maxTokens ?? 600,
            temperature: req.temperature ?? 0.7,
            ...(req.json ? { responseMimeType: 'application/json' } : {}),
          },
        },
      );
      const candidates = data.candidates as { content?: { parts?: { text?: string }[] } }[] | undefined;
      const text = candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      if (!text) throw new AiProviderError('Gemini returned an empty response');
      return text;
    },
  };
}

/**
 * Any OpenAI-compatible Chat Completions API: OpenAI, Groq (free tier), OpenRouter (free models),
 * Together, or a local Ollama server (http://localhost:11434/v1).
 */
export function openAiCompatibleProvider(
  apiKey: string | undefined,
  model = 'gpt-4o-mini',
  baseUrl = 'https://api.openai.com/v1',
  fetchFn: FetchFn = fetch,
): AiProvider {
  return {
    name: 'openai',
    model,
    enabled: true,
    async complete(req) {
      const data = await postJson(
        fetchFn,
        `${baseUrl.replace(/\/+$/, '')}/chat/completions`,
        apiKey ? { authorization: `Bearer ${apiKey}` } : {},
        {
          model,
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: req.prompt },
          ],
          max_tokens: req.maxTokens ?? 600,
          temperature: req.temperature ?? 0.7,
          ...(req.json ? { response_format: { type: 'json_object' } } : {}),
        },
      );
      const choices = data.choices as { message?: { content?: string } }[] | undefined;
      const text = choices?.[0]?.message?.content ?? '';
      if (!text) throw new AiProviderError('Model returned an empty response');
      return text;
    },
  };
}

/** Anthropic Claude via the Messages API (paid). */
export function anthropicProvider(apiKey: string, model = 'claude-haiku-5-5', fetchFn: FetchFn = fetch): AiProvider {
  return {
    name: 'anthropic',
    model,
    enabled: true,
    async complete(req) {
      const data = await postJson(
        fetchFn,
        'https://api.anthropic.com/v1/messages',
        { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        {
          model,
          max_tokens: req.maxTokens ?? 600,
          temperature: req.temperature ?? 0.7,
          system: req.json ? `${req.system}\nRespond with JSON only.` : req.system,
          messages: [{ role: 'user', content: req.prompt }],
        },
      );
      const content = data.content as { type: string; text?: string }[] | undefined;
      const text = content?.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('') ?? '';
      if (!text) throw new AiProviderError('Claude returned an empty response');
      return text;
    },
  };
}

export function createAiProvider(cfg: Pick<Config, 'AI_PROVIDER' | 'AI_API_KEY' | 'AI_MODEL' | 'AI_BASE_URL'>): AiProvider {
  switch (cfg.AI_PROVIDER) {
    case 'gemini':
      return geminiProvider(cfg.AI_API_KEY!, cfg.AI_MODEL || undefined);
    case 'openai':
      return openAiCompatibleProvider(cfg.AI_API_KEY, cfg.AI_MODEL || undefined, cfg.AI_BASE_URL || undefined);
    case 'anthropic':
      return anthropicProvider(cfg.AI_API_KEY!, cfg.AI_MODEL || undefined);
    default:
      return disabledProvider;
  }
}

/** Extracts the first JSON object from a model reply (models sometimes wrap JSON in prose or fences). */
export function parseJsonReply<T>(text: string): T {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new AiProviderError('Model reply contained no JSON object');
  return JSON.parse(text.slice(start, end + 1)) as T;
}
