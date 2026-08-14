/**
 * DashScope (Alibaba Cloud Qwen) provider built on the OpenAI-compatible API.
 *
 * The `openai` SDK is pointed at DashScope's compatible-mode endpoint, which
 * supports chat completions, streaming and function calling with the same
 * request/response shapes as OpenAI.
 */
import OpenAI, { APIError, APIUserAbortError } from "openai";
import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionFunctionTool,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionToolChoiceOption,
} from "openai/resources/chat/completions";

export const DASHSCOPE_BASE_URL =
  "https://dashscope.aliyuncs.com/compatible-mode/v1";

/** Primary model; `qwen-plus` is the faster/cheaper fallback. */
export type QwenModel = "qwen-max" | "qwen-plus" | (string & {});

export const DEFAULT_MODEL: QwenModel = "qwen-max";
export const FALLBACK_MODEL: QwenModel = "qwen-plus";

const NON_STREAMING_TIMEOUT_MS = 60_000;
const STREAMING_TIMEOUT_MS = 120_000;
const MAX_RATE_LIMIT_RETRIES = 3;
const SERVER_ERROR_RETRY_DELAY_MS = 2_000;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class QwenError extends Error {
  readonly status?: number;

  constructor(message: string, options?: { status?: number; cause?: unknown }) {
    super(message, { cause: options?.cause });
    this.name = "QwenError";
    this.status = options?.status;
  }
}

/** Thrown when `DASHSCOPE_API_KEY` is missing or rejected by DashScope. */
export class QwenAuthError extends QwenError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, { status: 401, cause: options?.cause });
    this.name = "QwenAuthError";
  }
}

/** Thrown when a request exceeds the configured timeout budget. */
export class QwenTimeoutError extends QwenError {
  constructor(timeoutMs: number, options?: { cause?: unknown }) {
    super(`Qwen request timed out after ${timeoutMs}ms`, {
      cause: options?.cause,
    });
    this.name = "QwenTimeoutError";
  }
}

// ---------------------------------------------------------------------------
// Message + option types
// ---------------------------------------------------------------------------

export type QwenMessage = ChatCompletionMessageParam;
export type QwenToolCall = ChatCompletionMessageToolCall;
export type QwenTool = ChatCompletionFunctionTool;

export interface ChatOptions {
  /** Override the instance model for a single call (e.g. fall back to qwen-plus). */
  model?: QwenModel;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  toolChoice?: ChatCompletionToolChoiceOption;
  parallelToolCalls?: boolean;
  /** Force JSON output; DashScope supports `json_object` in compatible mode. */
  responseFormat?: "text" | "json_object";
  /** Caller-owned cancellation (e.g. request aborted by the browser). */
  signal?: AbortSignal | null;
  /** Defaults to 60s for `chat` and 120s for `streamChat`. */
  timeoutMs?: number;
}

/** A tool call with its JSON arguments already parsed. */
export interface ParsedToolCall<TArgs = Record<string, unknown>> {
  id: string;
  name: string;
  arguments: TArgs;
  /** Raw JSON string as produced by the model, kept for logging/debugging. */
  rawArguments: string;
}

export type QwenStreamEvent =
  /** Incremental assistant text. */
  | { type: "content"; delta: string }
  /** Incremental tool-call arguments, useful for "searching…" style UI. */
  | {
      type: "tool_call_delta";
      index: number;
      id?: string;
      name?: string;
      argumentsDelta?: string;
    }
  /** Emitted once per completed stream with everything accumulated. */
  | {
      type: "done";
      content: string;
      toolCalls: ParsedToolCall[];
      finishReason: string | null;
      usage?: ChatCompletion["usage"];
    };

// ---------------------------------------------------------------------------
// Tool schemas
// ---------------------------------------------------------------------------

export interface SearchFlightsArgs {
  origin: string;
  destination: string;
  date: string;
  adults?: number;
}

export interface CompareRoutesArgs {
  routes: Array<{ origin: string; destination: string; date: string }>;
  budget: number;
}

export interface VerifyPriceArgs {
  routingIdentifier: string;
}

export interface CalculateBudgetArgs {
  totalBudget: number;
  spentSoFar: number;
  remainingLegs: number;
}

export interface SuggestAlternativesArgs {
  origin: string;
  destination: string;
  originalDate: string;
  flexDays: number;
}

export interface AgentToolArgsMap {
  search_flights: SearchFlightsArgs;
  compare_routes: CompareRoutesArgs;
  verify_price: VerifyPriceArgs;
  calculate_budget: CalculateBudgetArgs;
  suggest_alternatives: SuggestAlternativesArgs;
}

export type AgentToolName = keyof AgentToolArgsMap;

const IATA_DESCRIPTION = "3-letter IATA city or airport code, e.g. KUL, BKK";
const DATE_DESCRIPTION = "Departure date in YYYYMMDD format, e.g. 20260914";

export const SEARCH_FLIGHTS_TOOL: QwenTool = {
  type: "function",
  function: {
    name: "search_flights",
    description:
      "Search live one-way flight offers for a single leg. Returns priced offers including taxes, fees, baggage and a routingIdentifier used for price verification.",
    parameters: {
      type: "object",
      properties: {
        origin: { type: "string", description: IATA_DESCRIPTION },
        destination: { type: "string", description: IATA_DESCRIPTION },
        date: { type: "string", description: DATE_DESCRIPTION },
        adults: {
          type: "integer",
          minimum: 1,
          maximum: 9,
          description: "Number of adult passengers. Defaults to 1.",
        },
      },
      required: ["origin", "destination", "date"],
      additionalProperties: false,
    },
  },
};

export const COMPARE_ROUTES_TOOL: QwenTool = {
  type: "function",
  function: {
    name: "compare_routes",
    description:
      "Compare several candidate legs or full itineraries against a budget and rank them by total cost, duration and budget fit.",
    parameters: {
      type: "object",
      properties: {
        routes: {
          type: "array",
          minItems: 2,
          description: "Candidate legs to compare against each other.",
          items: {
            type: "object",
            properties: {
              origin: { type: "string", description: IATA_DESCRIPTION },
              destination: { type: "string", description: IATA_DESCRIPTION },
              date: { type: "string", description: DATE_DESCRIPTION },
            },
            required: ["origin", "destination", "date"],
            additionalProperties: false,
          },
        },
        budget: {
          type: "number",
          exclusiveMinimum: 0,
          description: "Total budget available for the compared routes.",
        },
      },
      required: ["routes", "budget"],
      additionalProperties: false,
    },
  },
};

export const VERIFY_PRICE_TOOL: QwenTool = {
  type: "function",
  function: {
    name: "verify_price",
    description:
      "Re-validate a previously returned offer before recommending it, confirming the fare is still bookable at the quoted price.",
    parameters: {
      type: "object",
      properties: {
        routingIdentifier: {
          type: "string",
          description:
            "The routingIdentifier returned by search_flights for the offer to verify.",
        },
      },
      required: ["routingIdentifier"],
      additionalProperties: false,
    },
  },
};

export const CALCULATE_BUDGET_TOOL: QwenTool = {
  type: "function",
  function: {
    name: "calculate_budget",
    description:
      "Compute remaining budget and the per-leg spending allowance for the legs that are still unplanned.",
    parameters: {
      type: "object",
      properties: {
        totalBudget: {
          type: "number",
          exclusiveMinimum: 0,
          description: "Total trip budget in the user's currency.",
        },
        spentSoFar: {
          type: "number",
          minimum: 0,
          description: "Amount already committed to booked or chosen legs.",
        },
        remainingLegs: {
          type: "integer",
          minimum: 0,
          description: "Number of legs still to be priced.",
        },
      },
      required: ["totalBudget", "spentSoFar", "remainingLegs"],
      additionalProperties: false,
    },
  },
};

export const SUGGEST_ALTERNATIVES_TOOL: QwenTool = {
  type: "function",
  function: {
    name: "suggest_alternatives",
    description:
      "Explore nearby departure dates within a flexibility window to find cheaper options for a leg.",
    parameters: {
      type: "object",
      properties: {
        origin: { type: "string", description: IATA_DESCRIPTION },
        destination: { type: "string", description: IATA_DESCRIPTION },
        originalDate: {
          type: "string",
          description: `Originally requested date. ${DATE_DESCRIPTION}`,
        },
        flexDays: {
          type: "integer",
          minimum: 0,
          maximum: 7,
          description:
            "How many days before and after originalDate may be searched.",
        },
      },
      required: ["origin", "destination", "originalDate", "flexDays"],
      additionalProperties: false,
    },
  },
};

/** The five tools exposed to the model, as OpenAI-compatible function schemas. */
export const AGENT_TOOLS: QwenTool[] = [
  SEARCH_FLIGHTS_TOOL,
  COMPARE_ROUTES_TOOL,
  VERIFY_PRICE_TOOL,
  CALCULATE_BUDGET_TOOL,
  SUGGEST_ALTERNATIVES_TOOL,
];

export const AGENT_TOOL_NAMES = AGENT_TOOLS.map(
  (tool) => tool.function.name,
) as AgentToolName[];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function isFunctionToolCall(
  toolCall: QwenToolCall,
): toolCall is Extract<QwenToolCall, { type: "function" }> {
  return toolCall.type === "function";
}

/**
 * Extract tool calls from an assistant message with their arguments parsed.
 * Malformed JSON from the model yields an empty argument object rather than
 * throwing, so the agent loop can respond with a tool error instead of dying.
 */
export function parseToolCalls(
  message: Pick<ChatCompletion.Choice["message"], "tool_calls">,
): ParsedToolCall[] {
  return (message.tool_calls ?? [])
    .filter(isFunctionToolCall)
    .map((toolCall) => ({
      id: toolCall.id,
      name: toolCall.function.name,
      arguments: safeParseArguments(toolCall.function.arguments),
      rawArguments: toolCall.function.arguments,
    }));
}

function safeParseArguments(raw: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Build the `tool` role message that feeds a tool result back to the model. */
export function toolResultMessage(
  toolCallId: string,
  result: unknown,
): QwenMessage {
  return {
    role: "tool",
    tool_call_id: toolCallId,
    content: typeof result === "string" ? result : JSON.stringify(result),
  };
}

interface TimeoutScope {
  signal: AbortSignal;
  /** True once the timeout (rather than the caller) triggered the abort. */
  timedOut: () => boolean;
  dispose: () => void;
}

/**
 * Combine a caller-provided signal with a timeout into a single signal, so a
 * stream can be cancelled by either the consumer or the deadline.
 */
function createTimeoutScope(
  timeoutMs: number,
  external?: AbortSignal | null,
): TimeoutScope {
  const controller = new AbortController();
  let didTimeout = false;

  const timer = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  const onExternalAbort = () => controller.abort();
  if (external) {
    if (external.aborted) {
      controller.abort();
    } else {
      external.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    timedOut: () => didTimeout,
    dispose: () => {
      clearTimeout(timer);
      external?.removeEventListener("abort", onExternalAbort);
    },
  };
}

interface RetryPlan {
  retry: boolean;
  delayMs: number;
}

/**
 * DashScope shares OpenAI's status semantics: 429 is throttling (backed off
 * exponentially) and 5xx is transient (retried once).
 */
function planRetry(error: unknown, attempt: number): RetryPlan {
  const noRetry: RetryPlan = { retry: false, delayMs: 0 };
  if (!(error instanceof APIError)) return noRetry;

  const status = error.status;

  if (status === 429) {
    if (attempt >= MAX_RATE_LIMIT_RETRIES) return noRetry;
    // 1s, 2s, 4s plus jitter to avoid synchronised retries across legs.
    const delayMs = 1_000 * 2 ** attempt + Math.floor(Math.random() * 250);
    return { retry: true, delayMs };
  }

  if (status === 500 || status === 502 || status === 503) {
    if (attempt >= 1) return noRetry;
    return { retry: true, delayMs: SERVER_ERROR_RETRY_DELAY_MS };
  }

  return noRetry;
}

function normalizeError(error: unknown): Error {
  if (error instanceof APIError && error.status === 401) {
    return new QwenAuthError(
      "DashScope rejected the credentials (401). Set a valid DASHSCOPE_API_KEY " +
        "in .env.local — keys are created at https://bailian.console.aliyun.com/ " +
        "and must have access to the Qwen models.",
      { cause: error },
    );
  }

  if (error instanceof APIError) {
    return new QwenError(
      `DashScope request failed (${error.status}): ${error.message}`,
      { status: error.status, cause: error },
    );
  }

  return error instanceof Error ? error : new QwenError(String(error));
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class QwenProvider {
  readonly model: QwenModel;
  private client?: OpenAI;

  constructor(model: QwenModel = DEFAULT_MODEL) {
    this.model = model;
  }

  /**
   * The SDK client is created lazily so importing this module never throws at
   * build time when the environment has no key configured yet. Retries are
   * disabled on the client because they are handled per status code here.
   */
  private getClient(): OpenAI {
    if (this.client) return this.client;

    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey) {
      throw new QwenAuthError(
        "DASHSCOPE_API_KEY is not set. Add it to .env.local before calling the Qwen provider.",
      );
    }

    this.client = new OpenAI({
      apiKey,
      baseURL: DASHSCOPE_BASE_URL,
      maxRetries: 0,
    });
    return this.client;
  }

  /** Non-streaming completion with optional function calling. */
  async chat(
    messages: QwenMessage[],
    tools?: QwenTool[],
    options: ChatOptions = {},
  ): Promise<ChatCompletion> {
    const timeoutMs = options.timeoutMs ?? NON_STREAMING_TIMEOUT_MS;
    const params: ChatCompletionCreateParamsNonStreaming = {
      ...this.baseParams(messages, tools, options),
      stream: false,
    };

    return this.withRetries(timeoutMs, options.signal, (scope) =>
      this.getClient().chat.completions.create(params, {
        signal: scope.signal,
        timeout: timeoutMs,
        maxRetries: 0,
      }),
    );
  }

  /**
   * Streaming completion. Yields text deltas and tool-call deltas as they
   * arrive, then a final `done` event with the accumulated message.
   */
  async *streamChat(
    messages: QwenMessage[],
    tools?: QwenTool[],
    options: ChatOptions = {},
  ): AsyncGenerator<QwenStreamEvent, void, void> {
    const timeoutMs = options.timeoutMs ?? STREAMING_TIMEOUT_MS;
    const params: ChatCompletionCreateParamsStreaming = {
      ...this.baseParams(messages, tools, options),
      stream: true,
      stream_options: { include_usage: true },
    };

    const scope = createTimeoutScope(timeoutMs, options.signal);

    try {
      // Retries only cover establishing the stream; once chunks have been
      // yielded a replay would duplicate content downstream.
      const stream = await this.withRetriesInScope(scope, timeoutMs, () =>
        this.getClient().chat.completions.create(params, {
          signal: scope.signal,
          timeout: timeoutMs,
          maxRetries: 0,
        }),
      );

      let content = "";
      let finishReason: string | null = null;
      let usage: ChatCompletion["usage"];
      const toolCallAccumulator = new Map<
        number,
        { id: string; name: string; arguments: string }
      >();

      try {
        for await (const chunk of stream) {
          if (chunk.usage) usage = chunk.usage;

          const choice = chunk.choices[0];
          if (!choice) continue;
          if (choice.finish_reason) finishReason = choice.finish_reason;

          const delta = choice.delta;
          if (delta?.content) {
            content += delta.content;
            yield { type: "content", delta: delta.content };
          }

          for (const toolCallDelta of delta?.tool_calls ?? []) {
            const accumulated = accumulateToolCall(
              toolCallAccumulator,
              toolCallDelta,
            );
            yield {
              type: "tool_call_delta",
              index: toolCallDelta.index,
              id: accumulated.id || undefined,
              name: toolCallDelta.function?.name,
              argumentsDelta: toolCallDelta.function?.arguments,
            };
          }
        }
      } catch (error) {
        throw this.toStreamError(error, scope, timeoutMs);
      }

      yield {
        type: "done",
        content,
        finishReason,
        usage,
        toolCalls: [...toolCallAccumulator.entries()]
          .sort(([a], [b]) => a - b)
          .map(([, call]) => ({
            id: call.id,
            name: call.name,
            arguments: safeParseArguments(call.arguments),
            rawArguments: call.arguments,
          })),
      };
    } finally {
      scope.dispose();
    }
  }

  private baseParams(
    messages: QwenMessage[],
    tools: QwenTool[] | undefined,
    options: ChatOptions,
  ): Omit<ChatCompletionCreateParamsNonStreaming, "stream"> {
    const hasTools = tools !== undefined && tools.length > 0;

    return {
      model: options.model ?? this.model,
      messages,
      ...(hasTools ? { tools } : {}),
      ...(hasTools && options.toolChoice
        ? { tool_choice: options.toolChoice }
        : {}),
      ...(hasTools && options.parallelToolCalls !== undefined
        ? { parallel_tool_calls: options.parallelToolCalls }
        : {}),
      ...(options.temperature !== undefined
        ? { temperature: options.temperature }
        : {}),
      ...(options.topP !== undefined ? { top_p: options.topP } : {}),
      ...(options.maxTokens !== undefined
        ? { max_tokens: options.maxTokens }
        : {}),
      ...(options.responseFormat
        ? { response_format: { type: options.responseFormat } }
        : {}),
    };
  }

  private async withRetries<T>(
    timeoutMs: number,
    external: AbortSignal | null | undefined,
    operation: (scope: TimeoutScope) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const scope = createTimeoutScope(timeoutMs, external);
      try {
        return await operation(scope);
      } catch (error) {
        const failure = this.toStreamError(error, scope, timeoutMs);
        const plan =
          failure instanceof QwenTimeoutError
            ? { retry: false, delayMs: 0 }
            : planRetry(error, attempt);
        if (!plan.retry) throw failure;
        await sleep(plan.delayMs);
      } finally {
        scope.dispose();
      }
    }
  }

  /** Retry variant that reuses one long-lived scope (used for streaming). */
  private async withRetriesInScope<T>(
    scope: TimeoutScope,
    timeoutMs: number,
    operation: () => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await operation();
      } catch (error) {
        const failure = this.toStreamError(error, scope, timeoutMs);
        const plan =
          failure instanceof QwenTimeoutError
            ? { retry: false, delayMs: 0 }
            : planRetry(error, attempt);
        if (!plan.retry || scope.signal.aborted) throw failure;
        await sleep(plan.delayMs);
      }
    }
  }

  private toStreamError(
    error: unknown,
    scope: TimeoutScope,
    timeoutMs: number,
  ): Error {
    if (scope.timedOut()) {
      return new QwenTimeoutError(timeoutMs, { cause: error });
    }
    if (error instanceof APIUserAbortError) {
      return error;
    }
    return normalizeError(error);
  }
}

function accumulateToolCall(
  accumulator: Map<number, { id: string; name: string; arguments: string }>,
  delta: ChatCompletionChunk.Choice.Delta.ToolCall,
): { id: string; name: string; arguments: string } {
  const existing =
    accumulator.get(delta.index) ?? { id: "", name: "", arguments: "" };

  const updated = {
    id: delta.id ?? existing.id,
    name: delta.function?.name ?? existing.name,
    arguments: existing.arguments + (delta.function?.arguments ?? ""),
  };

  accumulator.set(delta.index, updated);
  return updated;
}
