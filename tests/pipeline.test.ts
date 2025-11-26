import { describe, it, expect } from "vitest";
import {
  extractStage1,
  extractStage2,
  calculateAggregateRankings,
  pickChairman,
  abortIfNoStage1,
} from "../src/pipeline.js";
import type { AgentConfig, AgentState, Stage2Result } from "../src/types.js";

describe("extractStage1", () => {
  it("should extract only completed agent states", () => {
    const states: AgentState[] = [
      {
        config: { name: "claude", command: ["claude"], promptViaStdin: true },
        status: "completed",
        stdout: ["Hello world"],
        stderr: [],
      },
      {
        config: { name: "codex", command: ["codex"], promptViaStdin: true },
        status: "error",
        stdout: ["Error output"],
        stderr: [],
      },
      {
        config: { name: "gemini", command: ["gemini"], promptViaStdin: true },
        status: "completed",
        stdout: ["Gemini response"],
        stderr: [],
      },
    ];
    const result = extractStage1(states);
    expect(result).toHaveLength(2);
    expect(result[0].agent).toBe("claude");
    expect(result[0].response).toBe("Hello world");
    expect(result[1].agent).toBe("gemini");
    expect(result[1].response).toBe("Gemini response");
  });

  it("should handle empty states array", () => {
    const result = extractStage1([]);
    expect(result).toEqual([]);
  });

  it("should handle all failed states", () => {
    const states: AgentState[] = [
      {
        config: { name: "test", command: ["test"], promptViaStdin: true },
        status: "killed",
        stdout: [],
        stderr: [],
      },
    ];
    const result = extractStage1(states);
    expect(result).toEqual([]);
  });

  it("should join multiple stdout chunks and trim", () => {
    const states: AgentState[] = [
      {
        config: { name: "test", command: ["test"], promptViaStdin: true },
        status: "completed",
        stdout: ["  Hello ", "World  "],
        stderr: [],
      },
    ];
    const result = extractStage1(states);
    expect(result[0].response).toBe("Hello World");
  });

  it("should filter out timeout status", () => {
    const states: AgentState[] = [
      {
        config: { name: "slow", command: ["slow"], promptViaStdin: true },
        status: "timeout",
        stdout: ["Partial..."],
        stderr: [],
      },
    ];
    const result = extractStage1(states);
    expect(result).toEqual([]);
  });
});

describe("extractStage2", () => {
  it("should extract and parse rankings from completed states", () => {
    const states: AgentState[] = [
      {
        config: { name: "claude", command: ["claude"], promptViaStdin: true },
        status: "completed",
        stdout: ["Analysis...\n\nFINAL RANKING:\n1. Response A\n2. Response B"],
        stderr: [],
      },
    ];
    const result = extractStage2(states);
    expect(result).toHaveLength(1);
    expect(result[0].agent).toBe("claude");
    expect(result[0].parsedRanking).toContain("Response A");
    expect(result[0].parsedRanking).toContain("Response B");
  });

  it("should handle empty rankings", () => {
    const states: AgentState[] = [
      {
        config: { name: "test", command: ["test"], promptViaStdin: true },
        status: "completed",
        stdout: ["No ranking here"],
        stderr: [],
      },
    ];
    const result = extractStage2(states);
    expect(result[0].parsedRanking).toEqual([]);
  });

  it("should preserve raw ranking text", () => {
    const rawText = "My full ranking analysis...";
    const states: AgentState[] = [
      {
        config: { name: "test", command: ["test"], promptViaStdin: true },
        status: "completed",
        stdout: [rawText],
        stderr: [],
      },
    ];
    const result = extractStage2(states);
    expect(result[0].rankingRaw).toBe(rawText);
  });
});

describe("calculateAggregateRankings", () => {
  it("should calculate average ranks from multiple rankings", () => {
    const stage2: Stage2Result[] = [
      { agent: "claude", rankingRaw: "", parsedRanking: ["Response A", "Response B", "Response C"] },
      { agent: "codex", rankingRaw: "", parsedRanking: ["Response A", "Response C", "Response B"] },
      { agent: "gemini", rankingRaw: "", parsedRanking: ["Response B", "Response A", "Response C"] },
    ];
    const labels = {
      "Response A": "claude",
      "Response B": "codex",
      "Response C": "gemini",
    };
    const result = calculateAggregateRankings(stage2, labels);

    // claude (Response A): positions 1, 1, 2 = avg 1.33
    // codex (Response B): positions 2, 3, 1 = avg 2
    // gemini (Response C): positions 3, 2, 3 = avg 2.67
    expect(result[0].agent).toBe("claude");
    expect(result[0].averageRank).toBeCloseTo(1.33, 1);
    expect(result[1].agent).toBe("codex");
    expect(result[1].averageRank).toBeCloseTo(2, 1);
    expect(result[2].agent).toBe("gemini");
    expect(result[2].averageRank).toBeCloseTo(2.67, 1);
  });

  it("should handle empty rankings", () => {
    const stage2: Stage2Result[] = [];
    const labels = {};
    const result = calculateAggregateRankings(stage2, labels);
    expect(result).toEqual([]);
  });

  it("should ignore unknown labels", () => {
    const stage2: Stage2Result[] = [
      { agent: "test", rankingRaw: "", parsedRanking: ["Response X", "Response Y"] },
    ];
    const labels = { "Response A": "claude" };
    const result = calculateAggregateRankings(stage2, labels);
    expect(result).toEqual([]);
  });

  it("should sort by average rank ascending", () => {
    const stage2: Stage2Result[] = [
      { agent: "ranker", rankingRaw: "", parsedRanking: ["Response B", "Response A"] },
    ];
    const labels = {
      "Response A": "second",
      "Response B": "first",
    };
    const result = calculateAggregateRankings(stage2, labels);
    expect(result[0].agent).toBe("first");
    expect(result[0].averageRank).toBe(1);
    expect(result[1].agent).toBe("second");
    expect(result[1].averageRank).toBe(2);
  });

  it("should track rankings count correctly", () => {
    const stage2: Stage2Result[] = [
      { agent: "a", rankingRaw: "", parsedRanking: ["Response A"] },
      { agent: "b", rankingRaw: "", parsedRanking: ["Response A"] },
      { agent: "c", rankingRaw: "", parsedRanking: ["Response A"] },
    ];
    const labels = { "Response A": "target" };
    const result = calculateAggregateRankings(stage2, labels);
    expect(result[0].rankingsCount).toBe(3);
  });
});

describe("pickChairman", () => {
  const agents: AgentConfig[] = [
    { name: "claude", command: ["claude"], promptViaStdin: true },
    { name: "codex", command: ["codex"], promptViaStdin: true },
    { name: "gemini", command: ["gemini"], promptViaStdin: true },
  ];

  it("should return specified chairman when found", () => {
    const result = pickChairman(agents, "codex");
    expect(result.name).toBe("codex");
  });

  it("should fallback to DEFAULT_CHAIRMAN (gemini) when not specified", () => {
    const result = pickChairman(agents);
    expect(result.name).toBe("gemini");
  });

  it("should fallback to DEFAULT_CHAIRMAN when specified not found", () => {
    const result = pickChairman(agents, "unknown");
    expect(result.name).toBe("gemini");
  });

  it("should fallback to first agent when DEFAULT_CHAIRMAN not available", () => {
    const limitedAgents: AgentConfig[] = [
      { name: "claude", command: ["claude"], promptViaStdin: true },
      { name: "codex", command: ["codex"], promptViaStdin: true },
    ];
    const result = pickChairman(limitedAgents, "unknown");
    expect(result.name).toBe("claude");
  });

  it("should handle single agent", () => {
    const singleAgent: AgentConfig[] = [
      { name: "only", command: ["only"], promptViaStdin: true },
    ];
    const result = pickChairman(singleAgent);
    expect(result.name).toBe("only");
  });
});

describe("abortIfNoStage1", () => {
  it("should return true when stage1 is empty", () => {
    const result = abortIfNoStage1([]);
    expect(result).toBe(true);
  });

  it("should return false when stage1 has results", () => {
    const stage1 = [{ agent: "test", response: "test response" }];
    const result = abortIfNoStage1(stage1);
    expect(result).toBe(false);
  });

  it("should return false with multiple results", () => {
    const stage1 = [
      { agent: "a", response: "a" },
      { agent: "b", response: "b" },
    ];
    const result = abortIfNoStage1(stage1);
    expect(result).toBe(false);
  });
});
