import { describe, it, expect } from "vitest";
import {
  buildQuestionWithHistory,
  buildRankingPrompt,
  buildChairmanPrompt,
  parseRankingFromText,
} from "../src/prompts.js";
import type { ConversationEntry, Stage1Result, Stage2Result } from "../src/types.js";

describe("buildQuestionWithHistory", () => {
  it("should return question unchanged when history is empty", () => {
    const question = "What is the best database?";
    const result = buildQuestionWithHistory(question, []);
    expect(result).toBe(question);
  });

  it("should include history context when history has entries", () => {
    const question = "What about NoSQL?";
    const history: ConversationEntry[] = [
      {
        question: "What is the best database?",
        stage1: [],
        stage3Response: "PostgreSQL is often recommended.",
      },
    ];
    const result = buildQuestionWithHistory(question, history);
    expect(result).toContain("Previous conversation:");
    expect(result).toContain("Q: What is the best database?");
    expect(result).toContain("A: PostgreSQL is often recommended.");
    expect(result).toContain("Current question: What about NoSQL?");
  });

  it("should limit history to MAX_HISTORY_ENTRIES (5)", () => {
    const question = "Final question?";
    const history: ConversationEntry[] = [];
    for (let i = 1; i <= 10; i++) {
      history.push({
        question: `Question ${i}`,
        stage1: [],
        stage3Response: `Answer ${i}`,
      });
    }
    const result = buildQuestionWithHistory(question, history);
    // Should only include last 5 entries (6-10)
    // Use "Q: Question X\n" pattern to avoid "Question 1" matching "Question 10"
    expect(result).not.toContain("Q: Question 1\n");
    expect(result).not.toContain("Q: Question 5\n");
    expect(result).toContain("Q: Question 6\n");
    expect(result).toContain("Q: Question 10\n");
  });

  it("should handle multiple history entries correctly", () => {
    const question = "Third question";
    const history: ConversationEntry[] = [
      { question: "First", stage1: [], stage3Response: "First answer" },
      { question: "Second", stage1: [], stage3Response: "Second answer" },
    ];
    const result = buildQuestionWithHistory(question, history);
    expect(result).toContain("Q: First");
    expect(result).toContain("A: First answer");
    expect(result).toContain("Q: Second");
    expect(result).toContain("A: Second answer");
    expect(result).toContain("Current question: Third question");
  });
});

describe("buildRankingPrompt", () => {
  it("should build prompt with single response", () => {
    const stage1: Stage1Result[] = [{ agent: "claude", response: "My response" }];
    const result = buildRankingPrompt("Test question", stage1);
    expect(result).toContain("Question: Test question");
    expect(result).toContain("Response A:");
    expect(result).toContain("My response");
    expect(result).toContain("FINAL RANKING:");
  });

  it("should label multiple responses alphabetically", () => {
    const stage1: Stage1Result[] = [
      { agent: "claude", response: "Claude response" },
      { agent: "codex", response: "Codex response" },
      { agent: "gemini", response: "Gemini response" },
    ];
    const result = buildRankingPrompt("Test question", stage1);
    expect(result).toContain("Response A:");
    expect(result).toContain("Claude response");
    expect(result).toContain("Response B:");
    expect(result).toContain("Codex response");
    expect(result).toContain("Response C:");
    expect(result).toContain("Gemini response");
  });

  it("should include evaluation instructions", () => {
    const stage1: Stage1Result[] = [{ agent: "test", response: "Test" }];
    const result = buildRankingPrompt("Question", stage1);
    expect(result).toContain("Evaluate each response");
    expect(result).toContain("strengths and weaknesses");
    expect(result).toContain("final ranking");
  });
});

describe("buildChairmanPrompt", () => {
  it("should include all stage1 and stage2 results", () => {
    const stage1: Stage1Result[] = [
      { agent: "claude", response: "Claude says this" },
      { agent: "codex", response: "Codex says that" },
    ];
    const stage2: Stage2Result[] = [
      { agent: "claude", rankingRaw: "A > B", parsedRanking: ["Response A", "Response B"] },
      { agent: "codex", rankingRaw: "B > A", parsedRanking: ["Response B", "Response A"] },
    ];
    const result = buildChairmanPrompt("Original question", stage1, stage2);
    expect(result).toContain("Original Question: Original question");
    expect(result).toContain("STAGE 1 - Individual Responses:");
    expect(result).toContain("Agent: claude");
    expect(result).toContain("Response: Claude says this");
    expect(result).toContain("Agent: codex");
    expect(result).toContain("Response: Codex says that");
    expect(result).toContain("STAGE 2 - Peer Rankings:");
    expect(result).toContain("Ranking: A > B");
    expect(result).toContain("Ranking: B > A");
  });

  it("should include chairman instructions", () => {
    const stage1: Stage1Result[] = [{ agent: "test", response: "Test" }];
    const stage2: Stage2Result[] = [{ agent: "test", rankingRaw: "A", parsedRanking: ["Response A"] }];
    const result = buildChairmanPrompt("Question", stage1, stage2);
    expect(result).toContain("Chairman of an agent council");
    expect(result).toContain("synthesize");
    expect(result).toContain("collective wisdom");
  });
});

describe("parseRankingFromText", () => {
  it("should parse numbered list after FINAL RANKING marker", () => {
    const text = `
Analysis: Response A is good, Response B is better.

FINAL RANKING:
1. Response B
2. Response A
3. Response C
`;
    const result = parseRankingFromText(text);
    expect(result).toEqual(["Response B", "Response A", "Response C"]);
  });

  it("should parse unnumbered responses after FINAL RANKING marker", () => {
    const text = `
Some analysis here.

FINAL RANKING:
Response C
Response A
Response B
`;
    const result = parseRankingFromText(text);
    expect(result).toEqual(["Response C", "Response A", "Response B"]);
  });

  it("should fallback to finding Response labels anywhere in text", () => {
    const text = "I think Response B is best, followed by Response A, then Response C.";
    const result = parseRankingFromText(text);
    expect(result).toEqual(["Response B", "Response A", "Response C"]);
  });

  it("should return empty array when no responses found", () => {
    const text = "This text has no response labels at all.";
    const result = parseRankingFromText(text);
    expect(result).toEqual([]);
  });

  it("should handle mixed format with numbered and unnumbered", () => {
    const text = `
FINAL RANKING:
1. Response A
2. Response C
Response B is last
`;
    const result = parseRankingFromText(text);
    // Should prefer numbered format
    expect(result).toContain("Response A");
    expect(result).toContain("Response C");
  });

  it("should handle single response", () => {
    const text = "FINAL RANKING:\n1. Response A";
    const result = parseRankingFromText(text);
    expect(result).toEqual(["Response A"]);
  });

  it("should handle response labels with surrounding text", () => {
    const text = `
FINAL RANKING:
1. Response A is the best overall
2. Response B comes second
`;
    const result = parseRankingFromText(text);
    expect(result).toEqual(["Response A", "Response B"]);
  });
});
