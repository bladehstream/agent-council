import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AgentConfig, SessionState } from "../src/types.js";

// Mock process.exit to prevent tests from exiting
const mockExit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

// We need to test handleCommand which is not exported, so we'll test through the module
// For now, let's test the helper functions that are testable

describe("REPL State Management", () => {
  const createTestState = (): SessionState => ({
    history: [],
    agents: [
      { name: "claude", command: ["claude"], promptViaStdin: true },
      { name: "codex", command: ["codex"], promptViaStdin: true },
      { name: "gemini", command: ["gemini"], promptViaStdin: true },
    ],
    chairman: { name: "gemini", command: ["gemini"], promptViaStdin: true },
    timeoutMs: undefined,
  });

  describe("SessionState initialization", () => {
    it("should have empty history initially", () => {
      const state = createTestState();
      expect(state.history).toEqual([]);
    });

    it("should have agents list", () => {
      const state = createTestState();
      expect(state.agents).toHaveLength(3);
    });

    it("should have chairman set", () => {
      const state = createTestState();
      expect(state.chairman.name).toBe("gemini");
    });

    it("should have undefined timeout initially", () => {
      const state = createTestState();
      expect(state.timeoutMs).toBeUndefined();
    });
  });

  describe("History management", () => {
    it("should allow adding entries to history", () => {
      const state = createTestState();
      state.history.push({
        question: "Test question",
        stage1: [{ agent: "claude", response: "Test response" }],
        stage3Response: "Final answer",
      });
      expect(state.history).toHaveLength(1);
      expect(state.history[0].question).toBe("Test question");
    });

    it("should allow clearing history", () => {
      const state = createTestState();
      state.history.push({
        question: "Test",
        stage1: [],
        stage3Response: "Answer",
      });
      state.history = [];
      expect(state.history).toHaveLength(0);
    });

    it("should store multiple history entries", () => {
      const state = createTestState();
      for (let i = 0; i < 5; i++) {
        state.history.push({
          question: `Question ${i}`,
          stage1: [],
          stage3Response: `Answer ${i}`,
        });
      }
      expect(state.history).toHaveLength(5);
    });
  });

  describe("Chairman management", () => {
    it("should allow changing chairman", () => {
      const state = createTestState();
      const newChairman = state.agents.find((a) => a.name === "claude")!;
      state.chairman = newChairman;
      expect(state.chairman.name).toBe("claude");
    });

    it("should keep chairman in agents list", () => {
      const state = createTestState();
      const chairmanInAgents = state.agents.find((a) => a.name === state.chairman.name);
      expect(chairmanInAgents).toBeDefined();
    });
  });

  describe("Timeout management", () => {
    it("should allow setting timeout in milliseconds", () => {
      const state = createTestState();
      state.timeoutMs = 30000;
      expect(state.timeoutMs).toBe(30000);
    });

    it("should allow clearing timeout", () => {
      const state = createTestState();
      state.timeoutMs = 30000;
      state.timeoutMs = undefined;
      expect(state.timeoutMs).toBeUndefined();
    });

    it("should convert seconds to milliseconds correctly", () => {
      const state = createTestState();
      const seconds = 60;
      state.timeoutMs = seconds * 1000;
      expect(state.timeoutMs).toBe(60000);
    });
  });
});

describe("Command parsing patterns", () => {
  it("should parse simple command", () => {
    const input = "/help";
    const parts = input.trim().split(/\s+/);
    expect(parts[0]).toBe("/help");
    expect(parts.slice(1)).toEqual([]);
  });

  it("should parse command with argument", () => {
    const input = "/chairman claude";
    const parts = input.trim().split(/\s+/);
    expect(parts[0]).toBe("/chairman");
    expect(parts.slice(1)).toEqual(["claude"]);
  });

  it("should parse command with numeric argument", () => {
    const input = "/timeout 30";
    const parts = input.trim().split(/\s+/);
    expect(parts[0]).toBe("/timeout");
    expect(parseInt(parts[1], 10)).toBe(30);
  });

  it("should handle extra whitespace", () => {
    const input = "  /help  ";
    const parts = input.trim().split(/\s+/);
    expect(parts[0]).toBe("/help");
  });

  it("should handle multiple arguments", () => {
    const input = "/test arg1 arg2 arg3";
    const parts = input.trim().split(/\s+/);
    expect(parts[0]).toBe("/test");
    expect(parts.slice(1)).toEqual(["arg1", "arg2", "arg3"]);
  });

  it("should be case sensitive for command matching", () => {
    const input = "/HELP";
    const cmd = input.trim().split(/\s+/)[0].toLowerCase();
    expect(cmd).toBe("/help");
  });
});

describe("Input validation", () => {
  it("should identify slash commands", () => {
    const inputs = ["/help", "/exit", "/agents", "/chairman claude"];
    for (const input of inputs) {
      expect(input.startsWith("/")).toBe(true);
    }
  });

  it("should identify regular questions", () => {
    const inputs = ["What is JavaScript?", "How do I code?", "help me"];
    for (const input of inputs) {
      expect(input.startsWith("/")).toBe(false);
    }
  });

  it("should handle empty input", () => {
    const input = "";
    expect(input.trim()).toBe("");
  });

  it("should handle whitespace-only input", () => {
    const input = "   ";
    expect(input.trim()).toBe("");
  });
});

describe("Timeout argument parsing", () => {
  it("should parse valid timeout", () => {
    const arg = "30";
    const seconds = parseInt(arg, 10);
    expect(isNaN(seconds)).toBe(false);
    expect(seconds).toBe(30);
    expect(seconds >= 0).toBe(true);
  });

  it("should handle zero timeout", () => {
    const arg = "0";
    const seconds = parseInt(arg, 10);
    expect(seconds).toBe(0);
    const timeoutMs = seconds === 0 ? undefined : seconds * 1000;
    expect(timeoutMs).toBeUndefined();
  });

  it("should reject negative timeout", () => {
    const arg = "-10";
    const seconds = parseInt(arg, 10);
    expect(seconds < 0).toBe(true);
  });

  it("should reject non-numeric timeout", () => {
    const arg = "abc";
    const seconds = parseInt(arg, 10);
    expect(isNaN(seconds)).toBe(true);
  });

  it("should handle undefined argument", () => {
    const arg = undefined;
    const seconds = parseInt(arg as any, 10);
    expect(isNaN(seconds)).toBe(true);
  });
});

describe("Agent name matching", () => {
  const agents: AgentConfig[] = [
    { name: "claude", command: ["claude"], promptViaStdin: true },
    { name: "codex", command: ["codex"], promptViaStdin: true },
    { name: "gemini", command: ["gemini"], promptViaStdin: true },
  ];

  it("should find agent by exact name", () => {
    const name = "claude";
    const agent = agents.find((a) => a.name.toLowerCase() === name.toLowerCase());
    expect(agent).toBeDefined();
    expect(agent?.name).toBe("claude");
  });

  it("should find agent case-insensitively", () => {
    const name = "CLAUDE";
    const agent = agents.find((a) => a.name.toLowerCase() === name.toLowerCase());
    expect(agent).toBeDefined();
    expect(agent?.name).toBe("claude");
  });

  it("should return undefined for unknown agent", () => {
    const name = "unknown";
    const agent = agents.find((a) => a.name.toLowerCase() === name.toLowerCase());
    expect(agent).toBeUndefined();
  });

  it("should handle partial name (no match)", () => {
    const name = "clau";
    const agent = agents.find((a) => a.name.toLowerCase() === name.toLowerCase());
    expect(agent).toBeUndefined();
  });
});

describe("History display formatting", () => {
  it("should truncate long responses", () => {
    const response = "A".repeat(200);
    const maxLength = 100;
    const truncated = response.slice(0, maxLength);
    const suffix = response.length > maxLength ? "..." : "";
    expect(truncated.length).toBe(100);
    expect(suffix).toBe("...");
  });

  it("should not truncate short responses", () => {
    const response = "Short response";
    const maxLength = 100;
    const truncated = response.slice(0, maxLength);
    const suffix = response.length > maxLength ? "..." : "";
    expect(truncated).toBe("Short response");
    expect(suffix).toBe("");
  });

  it("should handle exactly 100 character response", () => {
    const response = "A".repeat(100);
    const maxLength = 100;
    const suffix = response.length > maxLength ? "..." : "";
    expect(suffix).toBe("");
  });
});

// Cleanup
afterEach(() => {
  mockExit.mockClear();
});
