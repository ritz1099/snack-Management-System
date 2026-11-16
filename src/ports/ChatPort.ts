export interface ChatMessage {
  /** Recipient volunteer id, if a direct message. */
  to?: string;
  /** Office/channel id, if posted to a channel. */
  channel?: string;
  text: string;
}

/**
 * The chat tool is the UI. In production this posts into the company's
 * existing chat app; here it is a simulated stand-in that records messages.
 */
export interface ChatPort {
  send(msg: ChatMessage): Promise<void>;
}
