import type { TranscriptTurn } from "@repo/contract";

/**
 * The voice connection of the Interview, behind one small interface so the
 * rest of the screen does not know who conducts the conversation.
 */
export interface VoiceHandlers {
  /** A finished turn, spoken by the agent or by the person. */
  onTurn(turn: TranscriptTurn): void;
  onMode(mode: "listening" | "speaking"): void;
  /** The connection ended without the user asking. */
  onLost(reason: string): void;
}

export interface VoiceSession {
  /** Sends a typed line into the same conversation. */
  sendText(text: string): void;
  end(): Promise<void>;
}

export class MicrophoneRefused extends Error {}

export interface VoiceConnector {
  /** False when no agent is configured: the voice button is then disabled. */
  readonly configured: boolean;
  connect(handlers: VoiceHandlers): Promise<VoiceSession>;
}

const AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID || "";

const notConfigured: VoiceConnector = {
  configured: false,
  connect: () => Promise.reject(new Error("Voice is not configured.")),
};

/** ElevenLabs' browser SDK, loaded only when an agent id is set and the user presses Begin. */
const elevenLabs: VoiceConnector = {
  configured: true,
  async connect(handlers) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch {
      throw new MicrophoneRefused("The microphone is closed.");
    }
    const { Conversation } = await import("@elevenlabs/client");
    let ended = false;
    const conversation = await Conversation.startSession({
      agentId: AGENT_ID,
      connectionType: "webrtc",
      onMessage: (message) => {
        const text = message.message?.trim();
        if (text)
          handlers.onTurn({
            speaker: message.source === "user" ? "user" : "agent",
            text,
          });
      },
      onModeChange: ({ mode }) => handlers.onMode(mode),
      onDisconnect: () => {
        if (!ended) handlers.onLost("The conversation ended.");
      },
      onError: (message) => {
        if (!ended) handlers.onLost(String(message));
      },
    });
    return {
      sendText: (text) => conversation.sendUserMessage(text),
      end: async () => {
        ended = true;
        await conversation.endSession();
      },
    };
  },
};

export function getVoice(): VoiceConnector {
  return AGENT_ID ? elevenLabs : notConfigured;
}
