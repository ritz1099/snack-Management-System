import { ChatPort, ChatMessage } from '../ports/ChatPort';

export type SimulatedChat = ChatPort & {
  readonly messages: ChatMessage[];
  to: (volunteerId: string) => ChatMessage[];
  toChannel: (channel: string) => ChatMessage[];
  reset: () => void;
};

/** Simulated chat tool: records every message so tests can assert on them. */
export const createSimulatedChat = (): SimulatedChat => {
  const messages: ChatMessage[] = [];

  const send = async (msg: ChatMessage): Promise<void> => {
    messages.push({ ...msg });
  };

  const to = (volunteerId: string): ChatMessage[] => messages.filter((m) => m.to === volunteerId);

  const toChannel = (channel: string): ChatMessage[] => messages.filter((m) => m.channel === channel);

  const reset = (): void => {
    messages.length = 0;
  };

  return { messages, send, to, toChannel, reset };
};
