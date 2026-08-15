/**
 * Discord bot — discord.js gateway client.
 *
 * Answers DMs, @mentions, `!trip <request>` and messages that open with a
 * `$` budget pattern. Progress is edited into a single status message
 * (throttled to one edit per 3 s) rather than spamming the channel, then the
 * route map and itinerary card are posted as attachments followed by the
 * text summary.
 */

import {
  AttachmentBuilder,
  ChannelType,
  Client,
  GatewayIntentBits,
  Partials,
  type Message,
} from "discord.js";
import { handleTripRequest } from "./handler";

const PROGRESS_THROTTLE_MS = 3000;
const MESSAGE_LIMIT = 2000;

/** Decide whether a message should trigger planning. */
function shouldRespond(message: Message): boolean {
  if (message.author.bot) return false;

  // DMs always count.
  if (message.channel.type === ChannelType.DM) return true;

  const text = message.content.trim();
  if (message.mentions.has(message.client.user!.id)) return true;
  if (/^!trip\b/i.test(text)) return true;
  // "$850 for Bangkok…" style openings in guild channels.
  if (/^\$\s*[\d,]/.test(text)) return true;
  return false;
}

export async function startDiscordBot(token: string): Promise<void> {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel],
  });

  // Serialise per channel so parallel plans do not interleave their replies.
  const queues = new Map<string, Promise<void>>();

  const processMessage = async (message: Message): Promise<void> => {
    const status = await message.reply("🧠 Planning your trip…");
    let lastEditAt = 0;
    let pendingProgress: string | null = null;

    const reply = await handleTripRequest(message.content, (progress) => {
      pendingProgress = progress;
      const now = Date.now();
      if (now - lastEditAt < PROGRESS_THROTTLE_MS) return;
      lastEditAt = now;
      const line = pendingProgress;
      pendingProgress = null;
      status.edit(line).catch(() => {
        // Losing a progress edit is cosmetic — keep planning.
      });
    });

    // Publish whatever progress arrived last, then the deliverables.
    if (pendingProgress) {
      await status.edit(pendingProgress).catch(() => undefined);
    }

    const attachments: AttachmentBuilder[] = reply.images.map((png, index) =>
      new AttachmentBuilder(png, {
        name: index === 0 ? "budgetwing-route.png" : "budgetwing-itinerary.png",
      }).setDescription(
        index === 0 ? "BudgetWing optimized route map" : "BudgetWing itinerary card",
      ),
    );
    if (attachments.length > 0) {
      await message.reply({
        content: "🗺️ Your optimized trip:",
        files: attachments,
      });
    }

    for (const chunk of chunkText(reply.text, MESSAGE_LIMIT)) {
      await message.reply(chunk);
    }
  };

  client.on("messageCreate", (message) => {
    if (!shouldRespond(message)) return;
    const key = message.channelId;
    const next = (queues.get(key) ?? Promise.resolve()).then(() =>
      processMessage(message).catch(async (error) => {
        const text = error instanceof Error ? error.message : String(error);
        console.error("[Discord] planning failed:", text);
        try {
          await message.reply(
            `⚠️ Something went wrong while planning: ${text}\n\nPlease try again in a moment.`,
          );
        } catch {
          // Channel may be gone — nothing more to do.
        }
      }),
    );
    queues.set(key, next);
  });

  client.once("ready", () => {
    console.log(`[Discord] bot online as ${client.user?.tag}`);
  });

  await client.login(token);
}

/** Split long text on newlines to stay under Discord's 2000-char limit. */
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
