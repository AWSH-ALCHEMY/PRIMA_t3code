import { describe, expect, it } from "vitest";
import { ThreadId } from "@t3tools/contracts";
import {
  buildAgentChannelTurnPrompt,
  extractAgentChannelPromptSender,
  getLatestAgentChannelKey,
  invertAgentEnvelope,
  listLinkedAgentThreads,
  resolveNextAgentEnvelope,
} from "./agentThread";
import type { ChatMessage, Thread } from "../types";

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

function buildThread(partial: Partial<Thread>): Thread {
  return {
    id: ThreadId.makeUnsafe("thread-default"),
    codexThreadId: null,
    projectId: "project-1" as Thread["projectId"],
    parentThreadId: null,
    threadKind: "agentThread",
    isHidden: false,
    isLocked: true,
    title: "Agent channel",
    model: "gpt-5.4",
    runtimeMode: "full-access",
    interactionMode: "default",
    session: null,
    messages: [],
    proposedPlans: [],
    error: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    latestTurn: null,
    branch: null,
    worktreePath: null,
    turnDiffSummaries: [],
    activities: [],
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

  it("returns latest channel key from message metadata", () => {
    expect(
      getLatestAgentChannelKey([
        buildMessage({
          id: "msg-1" as ChatMessage["id"],
          agentEnvelope: {
            channelKey: "old",
            senderLabel: "A",
            recipientLabel: "B",
          },
        }),
        buildMessage({
          id: "msg-2" as ChatMessage["id"],
          agentEnvelope: {
            channelKey: "new",
            senderLabel: "B",
            recipientLabel: "A",
          },
        }),
      ]),
    ).toBe("new");
  });

  it("inverts sender and recipient labels", () => {
    expect(
      invertAgentEnvelope({
        channelKey: "k",
        senderLabel: "Supervisor",
        recipientLabel: "Research Agent",
      }),
    ).toEqual({
      channelKey: "k",
      senderLabel: "Research Agent",
      recipientLabel: "Supervisor",
    });
  });

  it("lists linked agent threads by shared channel key", () => {
    const sourceId = ThreadId.makeUnsafe("source");
    const linked = buildThread({
      id: ThreadId.makeUnsafe("linked"),
      messages: [
        buildMessage({
          id: "msg-linked" as ChatMessage["id"],
          agentEnvelope: {
            channelKey: "channel-1",
            senderLabel: "A",
            recipientLabel: "B",
          },
        }),
      ],
    });
    const unrelated = buildThread({
      id: ThreadId.makeUnsafe("unrelated"),
      messages: [
        buildMessage({
          id: "msg-unrelated" as ChatMessage["id"],
          agentEnvelope: {
            channelKey: "channel-2",
            senderLabel: "A",
            recipientLabel: "B",
          },
        }),
      ],
    });

    const result = listLinkedAgentThreads(
      [
        buildThread({ id: sourceId }),
        linked,
        unrelated,
        buildThread({
          id: ThreadId.makeUnsafe("normal"),
          threadKind: "normal",
          messages: linked.messages,
        }),
      ],
      sourceId,
      "channel-1",
    );

    expect(result.map((thread) => thread.id)).toEqual([ThreadId.makeUnsafe("linked")]);
  });

  it("builds a user-facing turn prompt from channel metadata", () => {
    expect(buildAgentChannelTurnPrompt({ senderLabel: "Supervisor", text: "Do work." })).toBe(
      "Agent channel message from Supervisor:\n\nDo work.",
    );
  });

  it("extracts sender label from agent channel prompt", () => {
    expect(
      extractAgentChannelPromptSender("Agent channel message from Supervisor:\n\nDo work."),
    ).toBe("Supervisor");
    expect(extractAgentChannelPromptSender("Random prompt")).toBe(null);
  });
});
