import type { Result } from "@/lib/result";

/** Why an outbound message was not sent, in terms the services can act on. */
export type SendFailure =
  /** WhatsApp 24-hour window closed: send an approved template instead. */
  | "window_closed"
  /** Daily or rate limit reached: try later or use another channel. */
  | "rate_limited"
  /** Bad credentials, suspended account, blocked URL or insufficient balance. */
  | "rejected"
  /** Timeout, network error or provider 5xx after retries. */
  | "unavailable";

export type OutboundText = {
  /** E.164 number or provider contact ID (WhatsApp BSUID), as received. */
  to: string;
  text: string;
  channel: "whatsapp" | "sms" | "auto";
  /** Stable key so a retried send is never delivered twice. */
  idempotencyKey: string;
  requestId?: string;
};

export type SentMessage = { providerMessageId: string };

export interface MessagingProvider {
  sendText(message: OutboundText): Promise<Result<SentMessage, SendFailure>>;
}

export interface TemplateSender {
  sendTemplate(message: OutboundText): Promise<Result<SentMessage, SendFailure>>;
}

/** A one-way text-to-speech phone call; the recipient hears `text` and cannot reply. */
export type OutboundVoiceCall = {
  /** E.164 phone number. */
  to: string;
  text: string;
  /** BCP-47 tag for speech synthesis, e.g. `es-ES`. */
  language: string;
  /** Stable key so a retried request never dials twice. */
  idempotencyKey: string;
  requestId?: string;
};

export interface VoiceCaller {
  placeTextToSpeechCall(call: OutboundVoiceCall): Promise<Result<SentMessage, SendFailure>>;
}
