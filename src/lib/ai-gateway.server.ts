// Server-only Lovable AI Gateway helpers (OpenAI Responses via the AI SDK).
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { createLovableAiGatewayRunIdFetch } from "./ai-run-id.server.ts";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";
export const DEFAULT_TEXT_MODEL = "openai/gpt-6-astra";

export class GatewayError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

/** Streams a one-shot answer and returns the final text. */
export async function generateTextStreamed(opts: { instructions: string; prompt: string; signal?: AbortSignal }) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new GatewayError("AI is not configured for this app.", 401);
  const provider = createOpenAI({
    baseURL: GATEWAY_URL,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: createLovableAiGatewayRunIdFetch().fetch,
  });
  let failure: unknown = null;
  const result = streamText({
    maxRetries: 0,
    model: provider.responses(DEFAULT_TEXT_MODEL),
    instructions: opts.instructions,
    messages: [{ role: "user", content: opts.prompt }],
    ...(opts.signal ? { abortSignal: opts.signal } : {}),
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
  const responseBody = (e as { responseBody?: string } | null)?.responseBody;
  if (responseBody) {
    try {
      const body = JSON.parse(responseBody) as { error?: { message?: string }; message?: string };
      const message = body.error?.message ?? body.message;
      if (message) return new GatewayError(message, status || 500);
    } catch { /* Fall back to safe messages for malformed provider errors. */ }
  }
  if (status === 402) return new GatewayError("The AI credits for this workspace have run out. Add credits to keep using the explainer.", 402);
  if (status === 429) return new GatewayError("The AI is busy right now. Please try again in a minute.", 429);
  if (status === 403) return new GatewayError("AI access is blocked for this workspace right now.", 403);
  if (status === 401) return new GatewayError("AI is not configured for this app.", 401);
  console.error("AI gateway error", e);
  return new GatewayError(e ? "The AI couldn't answer right now. Please try again later." : "The AI returned no answer.", status || 500);
}
