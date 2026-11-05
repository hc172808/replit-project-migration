// Server-only Lovable AI Gateway helpers (OpenAI Responses via the AI SDK).
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";
const RUN_ID_HEADER = "X-Lovable-AIG-Run-ID";
export const DEFAULT_TEXT_MODEL = "openai/gpt-6-astra";

function runIdFetch(initialRunId?: string) {
  let runId = initialRunId?.trim() || undefined;
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (runId && !headers.has(RUN_ID_HEADER)) headers.set(RUN_ID_HEADER, runId);
    const response = await fetch(input, { ...init, headers });
    runId ??= response.headers.get(RUN_ID_HEADER)?.trim() || undefined;
    return response;
  };
}

export class GatewayError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

/** Streams a one-shot answer and returns the final text. */
export async function generateTextStreamed(opts: { instructions: string; prompt: string; signal?: AbortSignal }) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new GatewayError("AI is not configured for this app.", 401);
  const provider = createOpenAI({
    baseURL: GATEWAY_URL,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch(),
  });
  let failure: unknown = null;
  const result = streamText({
    model: provider.responses(DEFAULT_TEXT_MODEL),
    instructions: opts.instructions,
    messages: [{ role: "user", content: opts.prompt }],
    abortSignal: opts.signal,
    onError: ({ error }) => { failure = error; },
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });
  let text = "";
  try {
    text = await result.text;
  } catch (e) {
    failure ??= e;
  }
  if (failure || !text.trim()) throw toGatewayError(failure);
  return text;
}

function toGatewayError(e: unknown): GatewayError {
  const status = Number((e as { statusCode?: number } | null)?.statusCode ?? 0);
  if (status === 402) return new GatewayError("The AI credits for this workspace have run out. Add credits to keep using the explainer.", 402);
  if (status === 429) return new GatewayError("The AI is busy right now. Please try again in a minute.", 429);
  if (status === 403) return new GatewayError("AI access is blocked for this workspace right now.", 403);
  if (status === 401) return new GatewayError("AI is not configured for this app.", 401);
  console.error("AI gateway error", e);
  return new GatewayError(e ? "The AI couldn't answer right now. Please try again later." : "The AI returned no answer.", status || 500);
}
