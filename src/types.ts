export type AgentConfig = {
  name: string;
  command: string[];
  promptViaStdin?: boolean;
};

export type AgentStatus = "pending" | "running" | "completed" | "error" | "killed" | "timeout";

export type AgentState = {
  config: AgentConfig;
  status: AgentStatus;
  stdout: string[];
  stderr: string[];
  startTime?: number;
  endTime?: number;
  exitCode?: number | null;
  errorMessage?: string;
  process?: import("node:child_process").ChildProcess;
  timeoutHandle?: NodeJS.Timeout;
};

export type Stage1Result = { agent: string; response: string };
export type Stage2Result = { agent: string; rankingRaw: string; parsedRanking: string[] };
export type Stage3Result = { agent: string; response: string };

export type LabelMap = Record<string, string>;

export type ConversationEntry = {
  question: string;
  stage1: Stage1Result[];
  stage3Response: string;
};

export type SessionState = {
  history: ConversationEntry[];
  agents: AgentConfig[];
  chairman: AgentConfig;
  timeoutMs?: number;
};
