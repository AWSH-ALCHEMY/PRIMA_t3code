import type { OrchestrationAgentEnvelope, ThreadId } from "@t3tools/contracts";
import type { ChatMessage, Thread } from "../types";

export function resolveNextAgentEnvelope(
  threadId: ThreadId,
  messages: readonly ChatMessage[],
): OrchestrationAgentEnvelope {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const envelope = messages[index]?.agentEnvelope;
    if (!envelope) {
      continue;
    }
    return {
      channelKey: envelope.channelKey,
      senderLabel: envelope.recipientLabel,
      recipientLabel: envelope.senderLabel,
    };
  }
  return {
    channelKey: `project-channel:${threadId}`,
    senderLabel: "Agent",
    recipientLabel: "Agent",
  };
}

export function getLatestAgentChannelKey(messages: readonly ChatMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const channelKey = messages[index]?.agentEnvelope?.channelKey;
    if (channelKey && channelKey.length > 0) {
      return channelKey;
    }
  }
  return null;
}

export function invertAgentEnvelope(
  envelope: OrchestrationAgentEnvelope,
): OrchestrationAgentEnvelope {
  return {
    channelKey: envelope.channelKey,
    senderLabel: envelope.recipientLabel,
    recipientLabel: envelope.senderLabel,
  };
}

function threadHasAgentChannel(thread: Thread, channelKey: string): boolean {
  for (let index = thread.messages.length - 1; index >= 0; index -= 1) {
    if (thread.messages[index]?.agentEnvelope?.channelKey === channelKey) {
      return true;
    }
  }
  return false;
}

export function listLinkedAgentThreads(
  threads: readonly Thread[],
  sourceThreadId: ThreadId,
  channelKey: string,
): Thread[] {
  return threads.filter(
    (thread) =>
      thread.id !== sourceThreadId &&
      thread.threadKind === "agentThread" &&
      threadHasAgentChannel(thread, channelKey),
  );
}
