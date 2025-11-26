import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { callAgent, DEFAULT_AGENTS, DEFAULT_CHAIRMAN } from "../src/agents.js";
import type { AgentConfig, AgentState } from "../src/types.js";

describe("callAgent", () => {
  // Use a simple echo command for testing
  const echoConfig: AgentConfig = {
    name: "echo-test",
    command: ["echo", "hello"],
    promptViaStdin: false,
  };

  const catConfig: AgentConfig = {
    name: "cat-test",
    command: ["cat"],
    promptViaStdin: true,
  };

  it("should run command without stdin when promptViaStdin is false", async () => {
    const state: AgentState = {
      config: echoConfig,
      status: "pending",
      stdout: [],
      stderr: [],
    };

    const result = await callAgent(state, "ignored prompt", undefined);

    expect(result.status).toBe("completed");
    expect(result.stdout.join("")).toContain("hello");
    expect(result.exitCode).toBe(0);
    expect(result.startTime).toBeDefined();
    expect(result.endTime).toBeDefined();
  });

  it("should run command with stdin when promptViaStdin is true", async () => {
    const state: AgentState = {
      config: catConfig,
      status: "pending",
      stdout: [],
      stderr: [],
    };

    const result = await callAgent(state, "test input", undefined);

    expect(result.status).toBe("completed");
    expect(result.stdout.join("")).toBe("test input");
    expect(result.exitCode).toBe(0);
  });

  it("should handle command that writes to stderr", async () => {
    const stderrConfig: AgentConfig = {
      name: "stderr-test",
      command: ["sh", "-c", "echo error >&2"],
      promptViaStdin: false,
    };
    const state: AgentState = {
      config: stderrConfig,
      status: "pending",
      stdout: [],
      stderr: [],
    };

    const result = await callAgent(state, "", undefined);

    expect(result.stderr.join("")).toContain("error");
  });

  it("should set error status for non-zero exit code", async () => {
    const failConfig: AgentConfig = {
      name: "fail-test",
      command: ["sh", "-c", "exit 1"],
      promptViaStdin: false,
    };
    const state: AgentState = {
      config: failConfig,
      status: "pending",
      stdout: [],
      stderr: [],
    };

    const result = await callAgent(state, "", undefined);

    expect(result.status).toBe("error");
    expect(result.exitCode).toBe(1);
  });

  it("should handle timeout", async () => {
    // Use sh -c with read command which waits indefinitely for input
    const waitConfig: AgentConfig = {
      name: "wait-test",
      command: ["sh", "-c", "sleep 5"],
      promptViaStdin: false,
    };
    const state: AgentState = {
      config: waitConfig,
      status: "pending",
      stdout: [],
      stderr: [],
    };

    const result = await callAgent(state, "", 50); // 50ms timeout, sleep is 5s

    expect(result.status).toBe("timeout");
    expect(result.endTime).toBeDefined();
  });

  it("should not timeout when timeout is undefined", async () => {
    const state: AgentState = {
      config: echoConfig,
      status: "pending",
      stdout: [],
      stderr: [],
    };

    const result = await callAgent(state, "", undefined);

    expect(result.status).toBe("completed");
    expect(result.timeoutHandle).toBeUndefined();
  });

  it("should not timeout when timeout is 0", async () => {
    const state: AgentState = {
      config: echoConfig,
      status: "pending",
      stdout: [],
      stderr: [],
    };

    const result = await callAgent(state, "", 0);

    expect(result.status).toBe("completed");
  });

  it("should handle command spawn error for non-existent command", async () => {
    const badConfig: AgentConfig = {
      name: "bad-test",
      command: ["nonexistent-command-xyz-123"],
      promptViaStdin: false,
    };
    const state: AgentState = {
      config: badConfig,
      status: "pending",
      stdout: [],
      stderr: [],
    };

    const result = await callAgent(state, "", undefined);

    expect(result.status).toBe("error");
    expect(result.errorMessage).toBeDefined();
  });

  it("should track duration correctly", async () => {
    const state: AgentState = {
      config: echoConfig,
      status: "pending",
      stdout: [],
      stderr: [],
    };

    const beforeCall = Date.now();
    const result = await callAgent(state, "", undefined);
    const afterCall = Date.now();

    expect(result.startTime).toBeGreaterThanOrEqual(beforeCall);
    expect(result.startTime).toBeLessThanOrEqual(afterCall);
    expect(result.endTime).toBeGreaterThanOrEqual(result.startTime!);
    expect(result.endTime).toBeLessThanOrEqual(afterCall);
  });

  it("should handle multiple stdout chunks", async () => {
    const multiConfig: AgentConfig = {
      name: "multi-test",
      command: ["sh", "-c", "echo line1; echo line2; echo line3"],
      promptViaStdin: false,
    };
    const state: AgentState = {
      config: multiConfig,
      status: "pending",
      stdout: [],
      stderr: [],
    };

    const result = await callAgent(state, "", undefined);

    expect(result.stdout.length).toBeGreaterThanOrEqual(1);
    const fullOutput = result.stdout.join("");
    expect(fullOutput).toContain("line1");
    expect(fullOutput).toContain("line2");
    expect(fullOutput).toContain("line3");
  });

  it("should preserve killed status when process closes", async () => {
    const sleepConfig: AgentConfig = {
      name: "kill-test",
      command: ["sleep", "10"],
      promptViaStdin: false,
    };
    const state: AgentState = {
      config: sleepConfig,
      status: "pending",
      stdout: [],
      stderr: [],
    };

    // Start the agent
    const promise = callAgent(state, "", undefined);

    // Wait a bit then kill
    await new Promise((r) => setTimeout(r, 50));
    state.status = "killed";
    state.endTime = Date.now();
    state.process?.kill("SIGTERM");

    const result = await promise;
    expect(result.status).toBe("killed");
  });
});

describe("DEFAULT_AGENTS structure", () => {
  it("should have codex agent with correct command structure", () => {
    const codex = DEFAULT_AGENTS.find((a) => a.name === "codex");
    expect(codex).toBeDefined();
    expect(codex?.command[0]).toBe("codex");
    expect(codex?.command).toContain("exec");
    expect(codex?.command).toContain("--skip-git-repo-check");
    expect(codex?.command).toContain("-");
    expect(codex?.promptViaStdin).toBe(true);
  });

  it("should have claude agent with correct command structure", () => {
    const claude = DEFAULT_AGENTS.find((a) => a.name === "claude");
    expect(claude).toBeDefined();
    expect(claude?.command[0]).toBe("claude");
    expect(claude?.command).toContain("--print");
    expect(claude?.command).toContain("--output-format");
    expect(claude?.command).toContain("text");
    expect(claude?.promptViaStdin).toBe(true);
  });

  it("should have gemini agent with correct command structure", () => {
    const gemini = DEFAULT_AGENTS.find((a) => a.name === "gemini");
    expect(gemini).toBeDefined();
    expect(gemini?.command[0]).toBe("gemini");
    expect(gemini?.command).toContain("--output-format");
    expect(gemini?.command).toContain("text");
    expect(gemini?.promptViaStdin).toBe(true);
  });
});

describe("DEFAULT_CHAIRMAN", () => {
  it("should be gemini", () => {
    expect(DEFAULT_CHAIRMAN).toBe("gemini");
  });

  it("should match one of the DEFAULT_AGENTS", () => {
    const chairmanAgent = DEFAULT_AGENTS.find((a) => a.name === DEFAULT_CHAIRMAN);
    expect(chairmanAgent).toBeDefined();
  });
});
