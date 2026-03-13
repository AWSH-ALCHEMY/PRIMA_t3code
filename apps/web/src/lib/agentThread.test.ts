import { describe, expect, it } from "vitest";
import { ThreadId } from "@t3tools/contracts";
import { resolveNextAgentEnvelope } from "./agentThread";
import type { ChatMessage } from "../types";

function buildMessage(partial: Partial<ChatMessage>): ChatMessage {
  return {
    id: "msg-1" as ChatMessage["id"],
    role: "assistant",
    text: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    streaming: false,
    ...partial,
  };
}

describe("resolveNextAgentEnvelope", () => {
  it("swaps sender/recipient from the most recent agent envelope", () => {
    const threadId = ThreadId.makeUnsafe("thread-1");
    const messages: ChatMessage[] = [
      buildMessage({
        id: "msg-1" as ChatMessage["id"],
        agentEnvelope: {
          channelKey: "project-channel:thread-1",
          senderLabel: "Supervisor",
          recipientLabel: "Research Agent",
        },
      }),
      buildMessage({
        id: "msg-2" as ChatMessage["id"],
        agentEnvelope: {
          channelKey: "project-channel:thread-1",
          senderLabel: "Research Agent",
          recipientLabel: "Supervisor",
        },
      }),
    ];

    expect(resolveNextAgentEnvelope(threadId, messages)).toEqual({
      channelKey: "project-channel:thread-1",
      senderLabel: "Supervisor",
      recipientLabel: "Research Agent",
    });
  });

  it("falls back to a generic envelope when thread has no agent messages", () => {
    const threadId = ThreadId.makeUnsafe("thread-2");
    const messages: ChatMessage[] = [buildMessage({ id: "msg-1" as ChatMessage["id"] })];

    expect(resolveNextAgentEnvelope(threadId, messages)).toEqual({
      channelKey: "project-channel:thread-2",
      senderLabel: "Agent",
      recipientLabel: "Agent",
    });
  });
});
