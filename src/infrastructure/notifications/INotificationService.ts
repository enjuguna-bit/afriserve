/**
 * INotificationService — port for all borrower-facing communications.
 *
 * Implementations live in the infrastructure layer. The application layer
 * and domain event subscribers only depend on this interface.
 */

export interface SmsPayload {
  /** E.164 phone number, e.g. "+254712345678" */
  to: string;
  message: string;
  /** Opaque reference for deduplication / audit */
  reference?: string | null;
}

export interface SmsResult {
  success: boolean;
  /** Provider-assigned message id */
  messageId?: string | null;
  errorMessage?: string | null;
}

export interface NotificationPayload {
  clientId?: number | null;
  loanId?: number | null;
  phone?: string | null;
  message: string;
  channel: "sms";
  reference?: string | null;
}

export interface INotificationService {
  /**
   * Send an SMS to a borrower.
   * Never throws — returns SmsResult.success=false on failure so callers
   * can log without crashing the main operation.
   */
  sendSms(payload: SmsPayload): Promise<SmsResult>;

  /**
   * High-level notification dispatch — resolves channel from payload,
   * logs the attempt, and delegates to the appropriate send method.
   */
  notify(payload: NotificationPayload): Promise<void>;

  /** True if the service is configured and ready to send. */
  isEnabled(): boolean;
}
