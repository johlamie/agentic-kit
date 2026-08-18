import type { SupervisorConfig } from "../config.js";
import { redactText, safeError } from "../security/redact.js";

export interface TelegramResponse {
  ok: boolean;
  result?: { message_id?: number };
  description?: string;
}

export class TelegramClient {
  public constructor(
    private readonly config: Pick<SupervisorConfig, "telegramBotToken" | "telegramChatId">,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {}

  public get configured(): boolean {
    return Boolean(this.config.telegramBotToken && this.config.telegramChatId);
  }

  public async send(message: string): Promise<string | null> {
    if (!this.config.telegramBotToken || !this.config.telegramChatId) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    timer.unref();
    try {
      // Telegram requires the bot token in the request path. The URL is never
      // logged and safeError/redactText mask this path if fetch includes it in
      // an exception.
      const response = await this.fetchImplementation(`https://api.telegram.org/bot${this.config.telegramBotToken}/sendMessage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: this.config.telegramChatId,
          text: redactText(message, 3_500),
          disable_web_page_preview: true,
        }),
        signal: controller.signal,
      });
      const payload = await response.json() as TelegramResponse;
      if (!response.ok || !payload.ok) throw new Error(payload.description ?? `Telegram HTTP ${response.status}`);
      return payload.result?.message_id === undefined ? null : String(payload.result.message_id);
    } catch (error) {
      throw new Error(`Telegram notification failed: ${safeError(error)}`);
    } finally {
      clearTimeout(timer);
    }
  }
}
