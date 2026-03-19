/**
 * AfricasTalkingSmsService — SMS adapter for Africa's Talking API.
 *
 * Africa's Talking is the dominant SMS gateway in Kenya/East Africa.
 * The API is simple: POST to https://api.africastalking.com/version1/messaging
 * with form-encoded body { username, to, message, from? }.
 *
 * Configuration (env vars):
 *   AT_API_KEY          — Africa's Talking API key (required)
 *   AT_USERNAME         — Africa's Talking username, e.g. "sandbox" or your org name
 *   AT_SENDER_ID        — Optional sender ID / shortcode
 *   AT_SANDBOX          — "true" to use sandbox endpoint (default: false)
 */
import type {
  INotificationService,
  SmsPayload,
  SmsResult,
  NotificationPayload,
} from "./INotificationService.js";

export interface AfricasTalkingOptions {
  apiKey: string;
  username: string;
  senderId?: string | null;
  sandbox?: boolean;
}

const LIVE_URL    = "https://api.africastalking.com/version1/messaging";
const SANDBOX_URL = "https://api.sandbox.africastalking.com/version1/messaging";

export class AfricasTalkingSmsService implements INotificationService {
  private readonly _apiKey:    string;
  private readonly _username:  string;
  private readonly _senderId:  string | null;
  private readonly _endpoint:  string;
  private readonly _enabled:   boolean;

  constructor(options: AfricasTalkingOptions) {
    this._apiKey   = options.apiKey.trim();
    this._username = options.username.trim();
    this._senderId = options.senderId?.trim() || null;
    this._endpoint = options.sandbox ? SANDBOX_URL : LIVE_URL;
    this._enabled  = Boolean(this._apiKey && this._username);
  }

  isEnabled(): boolean {
    return this._enabled;
  }

  async sendSms(payload: SmsPayload): Promise<SmsResult> {
    if (!this._enabled) {
      return { success: false, errorMessage: "AfricasTalking SMS service is not configured" };
    }

    const body = new URLSearchParams({
      username: this._username,
      to:       payload.to,
      message:  payload.message,
    });
    if (this._senderId) body.set("from", this._senderId);

    try {
      const response = await fetch(this._endpoint, {
        method:  "POST",
        headers: {
          "apiKey":       this._apiKey,
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept":       "application/json",
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        return {
          success:      false,
          errorMessage: `HTTP ${response.status}: ${errorText.slice(0, 200)}`,
        };
      }

      const json = await response.json() as Record<string, any>;
      // AT response: { SMSMessageData: { Recipients: [{ status, messageId, ... }] } }
      const recipients: Record<string, any>[] =
        json?.SMSMessageData?.Recipients ?? [];
      const first = recipients[0];
      const status = String(first?.status ?? "").toLowerCase();

      if (status === "success" || status.includes("sent")) {
        return { success: true, messageId: String(first?.messageId ?? "") };
      }

      return {
        success:      false,
        errorMessage: first?.status ?? "Unknown AT response",
      };
    } catch (err) {
      return {
        success:      false,
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async notify(payload: NotificationPayload): Promise<void> {
    if (!payload.phone) return;
    await this.sendSms({
      to:        payload.phone,
      message:   payload.message,
      reference: payload.reference ?? null,
    });
    // Errors logged by sendSms — notify() never throws
  }
}

// ── Factory from environment variables ────────────────────────────────────

export function createAfricasTalkingSmsService(
  env: NodeJS.ProcessEnv = process.env,
): AfricasTalkingSmsService | null {
  const apiKey   = String(env.AT_API_KEY   ?? "").trim();
  const username = String(env.AT_USERNAME  ?? "").trim();
  if (!apiKey || !username) return null;

  return new AfricasTalkingSmsService({
    apiKey,
    username,
    senderId: String(env.AT_SENDER_ID ?? "").trim() || null,
    sandbox:  String(env.AT_SANDBOX   ?? "").trim().toLowerCase() === "true",
  });
}
