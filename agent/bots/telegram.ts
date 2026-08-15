/**
 * Telegram bot — raw HTTP long polling against the Bot API (no library).
 *
 * Flow per message: acknowledge with "🧠 Planning your trip…", stream
 * throttled progress updates (max one per 3 s), then post the route map,
 * the itinerary card and the text summary. Requests from the same chat are
 * serialised so interleaved plans cannot tangle their replies.
 */

import { handleTripRequest } from "./handler";

const POLL_TIMEOUT_SECONDS = 30;
const PROGRESS_THROTTLE_MS = 3000;
const MESSAGE_LIMIT = 4096;

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
  };
}

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

export async function startTelegramBot(token: string): Promise<void> {
  const base = `https://api.telegram.org/bot${token}`;
  let offset = 0;
  let stopping = false;

  const call = async <T>(
    method: string,
    payload?: Record<string, unknown> | FormData,
  ): Promise<T> => {
    const isForm = payload instanceof FormData;
    const response = await fetch(`${base}/${method}`, {
      method: "POST",
      headers: isForm ? undefined : { "Content-Type": "application/json" },
      body: isForm ? payload : payload ? JSON.stringify(payload) : undefined,
    });
    const body = (await response.json()) as TelegramResponse<T>;
    if (!body.ok || body.result === undefined) {
      throw new Error(`Telegram ${method} failed: ${body.description ?? response.status}`);
    }
    return body.result;
  };

  const sendMessage = async (chatId: number, text: string): Promise<void> => {
    // Telegram caps messages at 4096 characters — split on line boundaries.
    for (const chunk of chunkText(text, MESSAGE_LIMIT)) {
      await call("sendMessage", { chat_id: chatId, text: chunk });
    }
  };

  const sendPhoto = async (
    chatId: number,
    png: Buffer,
    filename: string,
    caption?: string,
  ): Promise<void> => {
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append("photo", new Blob([new Uint8Array(png)]), filename);
    if (caption) form.append("caption", caption);
    await call("sendPhoto", form);
  };

  const sendTyping = async (chatId: number): Promise<void> => {
    try {
      await call("sendChatAction", { chat_id: chatId, action: "typing" });
    } catch {
      // Cosmetic only — never fail a plan over a typing indicator.
    }
  };

  /** One planning conversation; progress lines are throttled to 1 per 3 s. */
  const processMessage = async (chatId: number, text: string): Promise<void> => {
    let lastProgressAt = 0;

    await sendMessage(chatId, "🧠 Planning your trip…");

    const reply = await handleTripRequest(text, (progress) => {
      const now = Date.now();
      if (now - lastProgressAt < PROGRESS_THROTTLE_MS) return;
      lastProgressAt = now;
      void sendTyping(chatId);
      sendMessage(chatId, progress).catch((error) =>
        console.error("[Telegram] progress send failed:", error),
      );
    });

    for (const [index, image] of reply.images.entries()) {
      await sendPhoto(
        chatId,
        image,
        index === 0 ? "budgetwing-route.png" : "budgetwing-itinerary.png",
        index === 0 ? "🗺️ BudgetWing — optimized route" : undefined,
      );
    }
    await sendMessage(chatId, reply.text);
  };

  // Serialise per chat: a second request waits for the first to finish.
  const queues = new Map<number, Promise<void>>();
  const enqueue = (chatId: number, text: string): void => {
    const next = (queues.get(chatId) ?? Promise.resolve()).then(() =>
      processMessage(chatId, text).catch(async (error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[Telegram] planning failed:", message);
        try {
          await sendMessage(
            chatId,
            `⚠️ Something went wrong while planning: ${message}\n\nPlease try again in a moment.`,
          );
        } catch {
          // Chat may be unreachable — nothing more to do.
        }
      }),
    );
    queues.set(chatId, next);
  };

  const shutdown = () => {
    stopping = true;
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  console.log("[Telegram] bot polling for updates…");
  while (true) {
    if (stopping) break;
    try {
      const updates = await call<TelegramUpdate[]>("getUpdates", {
        offset,
        timeout: POLL_TIMEOUT_SECONDS,
        allowed_updates: ["message"],
      });
      for (const update of updates) {
        offset = update.update_id + 1;
        const chatId = update.message?.chat.id;
        const text = update.message?.text;
        if (chatId !== undefined && typeof text === "string" && text.trim().length > 0) {
          enqueue(chatId, text);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[Telegram] poll error:", message);
      // Back off briefly so a bad token or outage does not hot-loop.
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

/** Split long text on newlines without breaking mid-character-pair. */
function chunkText(text: string, limit: number): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    let cut = remaining.lastIndexOf("\n", limit);
    if (cut < limit / 2) cut = limit;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).replace(/^\n/, "");
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}
