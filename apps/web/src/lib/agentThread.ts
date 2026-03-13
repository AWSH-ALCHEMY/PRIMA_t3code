import type { OrchestrationAgentEnvelope, ThreadId } from "@t3tools/contracts";
import type { ChatMessage } from "../types";

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
