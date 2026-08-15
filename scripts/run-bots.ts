/**
 * Chat-bot entry point: `npm run bots`.
 *
 * Starts whichever bots have tokens configured (Telegram and/or Discord).
 * Loads .env.local / .env the way Next.js would, since this runs standalone
 * under tsx. With no tokens configured it prints setup instructions instead.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startTelegramBot } from "../agent/bots/telegram";
import { startDiscordBot } from "../agent/bots/discord";

/** KEY=value lines → process.env, never overwriting real environment. */
function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const key = match[1];
    if (process.env[key] !== undefined) continue;
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadEnvFile(resolve(root, ".env.local"));
loadEnvFile(resolve(root, ".env"));

const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const discordToken = process.env.DISCORD_BOT_TOKEN;

const hasTelegram = !!telegramToken && !telegramToken.startsWith("your_");
const hasDiscord = !!discordToken && !discordToken.startsWith("your_");

if (!hasTelegram && !hasDiscord) {
  console.log(`
No bot tokens configured — nothing to start.

Setup:
  1. Telegram: message @BotFather on Telegram, send /newbot and copy the token.
  2. Discord:  create an app at https://discord.com/developers/applications,
               add a bot, enable the MESSAGE CONTENT intent, copy the token.
  3. Put the tokens in .env.local:

     TELEGRAM_BOT_TOKEN=<token>
     DISCORD_BOT_TOKEN=<token>

  4. Run again: npm run bots
`);
  process.exit(0);
}

const runners: Promise<void>[] = [];
if (hasTelegram) {
  console.log("[Bots] starting Telegram bot…");
  runners.push(
    startTelegramBot(telegramToken!).catch((error) => {
      console.error("[Bots] Telegram stopped:", error);
    }),
  );
}
if (hasDiscord) {
  console.log("[Bots] starting Discord bot…");
  runners.push(
    startDiscordBot(discordToken!).catch((error) => {
      console.error("[Bots] Discord stopped:", error);
    }),
  );
}

// Keep the process alive and surface a clean stop on Ctrl+C.
process.on("SIGINT", () => {
  console.log("\n[Bots] shutting down…");
  // Give in-flight replies a moment, then exit.
  setTimeout(() => process.exit(0), 1500).unref();
});

Promise.allSettled(runners).then(() => {
  console.log("[Bots] all bot runners exited.");
});
