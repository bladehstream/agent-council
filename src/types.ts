export type AgentConfig = {
  name: string;
  command: string[];
  promptViaStdin?: boolean;
};

/**
 * Pipeline operating mode.
 * - 'compete': Responses are ranked, best one is refined (default)
 * - 'merge': All responses are merged/synthesized together
 */
export type PipelineMode = 'compete' | 'merge';

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

export type Stage1Result = {
  agent: string;
  /** Raw response text from the agent */
  response: string;
  /** Executive summary extracted from structured JSON output (if available) */
  summary?: string;
};
export type Stage2Result = { agent: string; rankingRaw: string; parsedRanking: string[] };
export type Stage3Result = { agent: string; response: string };

/**
 * Result from custom Stage 2 processing (e.g., sectioned deduplication).
 */
export type Stage2CustomResult = {
  /** Consolidated content per section */
  sections: Record<string, string>;
  /** Conflicts flagged between agents */
  conflicts?: Array<{
    topic: string;
    positions: Array<{ agent: string; position: string }>;
    resolution?: string;
  }>;
  /** Unique insights to preserve */
  uniqueInsights?: Array<{
    source: string;
    insight: string;
  }>;
  /** Raw outputs from custom Stage 2 agents (for debugging/logging) */
  rawOutputs?: Array<{ agent: string; response: string }>;
};

/**
 * Handler function for custom Stage 2 processing.
 * Takes Stage 1 results and returns consolidated output.
 */
export type Stage2CustomHandler = (
  stage1Results: Stage1Result[],
  agents: AgentConfig[],
  timeoutMs?: number
) => Promise<Stage2CustomResult>;

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

// Enhanced pipeline types for per-stage configuration
export type ModelTier = "fast" | "default" | "heavy";

export type StageAgentConfig = {
  agents: AgentConfig[];
};

/**
 * Two-pass chairman configuration for reliable large output generation.
 *
 * Pass 1 (Synthesis): Produces executive summary, ambiguities, consensus notes,
 * implementation phases, and section outlines.
 *
 * Pass 2 (Detail): Expands section outlines into full detailed specifications.
 *
 * Both passes use sectioned delimiters for robust parsing and truncation recovery.
 */
export type TwoPassConfig = {
  /**
   * Enable two-pass chairman output.
   * When enabled, the chairman runs twice: first for synthesis, then for details.
   */
  enabled: boolean;
  /**
   * Model tier for Pass 1 (synthesis).
   * If not specified, uses the chairman's configured tier.
   */
  pass1Tier?: ModelTier;
  /**
   * Model tier for Pass 2 (detailed specifications).
   * If not specified, uses N-1 tier from pass1Tier (fast stays fast).
   */
  pass2Tier?: ModelTier;
  /**
   * Output format instructions for Pass 1.
   * Should request synthesis-level output: summary, ambiguities, phases, outlines.
   *
   * If pass1IsCustomPrompt is true, this is used as the COMPLETE prompt
   * (not appended to default). Use placeholders: ${QUERY}, ${RESPONSES}, ${MODEL_LIST}
   */
  pass1Format?: string;
  /**
   * If true, pass1Format is a complete custom prompt that replaces the default.
   * Placeholders ${QUERY}, ${RESPONSES}, ${MODEL_LIST} will be substituted.
   * If false (default), pass1Format is appended as "Output Format" section.
   */
  pass1IsCustomPrompt?: boolean;
  /**
   * Output format instructions for Pass 2.
   * Should request detailed spec sections, with Pass 1 output as context.
   *
   * If pass2IsCustomPrompt is true, this is used as the COMPLETE prompt.
   * Use placeholders: ${QUERY}, ${RESPONSES}, ${PASS1_OUTPUT}, ${MODEL_LIST}
   */
  pass2Format?: string;
  /**
   * If true, pass2Format is a complete custom prompt that replaces the default.
   * Placeholders ${QUERY}, ${RESPONSES}, ${PASS1_OUTPUT}, ${MODEL_LIST} will be substituted.
   * If false (default), pass2Format is appended as "Output Format" section.
   */
  pass2IsCustomPrompt?: boolean;
};

/**
 * Result from a two-pass chairman execution.
 */
export type TwoPassResult = {
  /** Pass 1 output (synthesis) */
  pass1: Stage3Result;
  /** Pass 2 output (detailed specifications) */
  pass2: Stage3Result;
  /** Combined/merged output if applicable */
  combined?: string;
  /** Which sections were successfully parsed from each pass */
  parsedSections: {
    pass1: string[];
    pass2: string[];
  };
  /** True if Pass 2 failed and section_outlines from Pass 1 were used as fallback */
  usedFallback?: boolean;
};

/**
 * Parsed section from sectioned output format.
 */
export type ParsedSection = {
  name: string;
  content: string;
  complete: boolean;
};

export type EnhancedPipelineConfig = {
  /**
   * Pipeline operating mode.
   * - 'compete' (default): Responses are ranked by evaluators, winner is refined
   * - 'merge': All responses are merged/synthesized together (skips stage2)
   */
  mode?: PipelineMode;

  stage1: StageAgentConfig & {
    /**
     * Optional prompt override for stage1 responders.
     * If not provided, the question is passed directly.
     */
    prompt?: string;
  };

  /**
   * Stage 2 configuration.
   * - 'compete' mode: Required for ranking responses
   * - 'merge' mode: Ignored (Stage 2 skipped)
   * - 'custom' handler: Processes Stage 1 results with custom logic
   */
  stage2?: StageAgentConfig & {
    /**
     * Custom Stage 2 handler for specialized processing (e.g., sectioned deduplication).
     * When provided, this handler is called instead of the default ranking logic.
     * The handler receives Stage 1 results and returns consolidated output.
     *
     * Note: When using a custom handler in merge mode, set mode: 'merge' and
     * provide the handler. Stage 2 will run the custom handler instead of skipping.
     */
    customHandler?: Stage2CustomHandler;
  };

  stage3: {
    chairman: AgentConfig;
    useReasoning?: boolean;
    /**
     * Optional output format instructions for the chairman.
     * When provided, these instructions are appended to the chairman prompt
     * to enforce structured output (e.g., JSON schema requirements).
     *
     * Example:
     * ```
     * outputFormat: `Output your response as JSON with this structure:
     * {
     *   "summary": "...",
     *   "recommendations": [...],
     *   "ambiguities": [...]
     * }`
     * ```
     *
     * Note: When twoPass is enabled, use twoPass.pass1Format and pass2Format instead.
     */
    outputFormat?: string;
    /**
     * Optional fallback chairman to use if the primary chairman fails.
     * Only one fallback attempt is made.
     */
    fallback?: AgentConfig;
    /**
     * Use executive summaries instead of full responses for chairman context.
     * Significantly reduces context size when Stage 1 responses are large.
     * Requires Stage 1 agents to output structured JSON with executive_summary field.
     */
    useSummaries?: boolean;
    /**
     * Two-pass chairman configuration for reliable large output generation.
     * When enabled, splits chairman synthesis into two sequential passes:
     * - Pass 1: Synthesis (summary, ambiguities, phases, outlines)
     * - Pass 2: Detail (full spec sections)
     *
     * This improves reliability by keeping each pass within output token limits.
     */
    twoPass?: TwoPassConfig;
  };

  /**
   * Optional adversarial critique phase configuration.
   * When enabled, adds critique and resolve stages after draft generation.
   * Works with both 'compete' and 'merge' modes.
   */
  critique?: CritiqueConfig;
};

// Checkpoint types for pipeline resumption
export type CheckpointStage = "stage1" | "stage2" | "complete";

export type CheckpointData = {
  version: 1;
  timestamp: string;
  question: string;
  completedStage: CheckpointStage;
  stage1?: Stage1Result[];
  stage2?: Stage2Result[];
  labelToAgent?: LabelMap;
  aggregate?: Array<{ agent: string; averageRank: number; rankingsCount: number }>;
};

export type CheckpointOptions = {
  /**
   * Directory where checkpoint files are saved.
   * If not provided, checkpointing is disabled.
   */
  checkpointDir?: string;
  /**
   * Optional filename for the checkpoint (without extension).
   * Defaults to "council-checkpoint".
   */
  checkpointName?: string;
};

// ============================================================================
// Critique Loop Types
// ============================================================================

/**
 * An individual critique item raised by a critic.
 */
export type CritiqueItem = {
  /** Which model raised this critique */
  source: string;
  /** Category of the critique */
  category: 'blocking' | 'advisory';
  /** What the issue is */
  description: string;
  /** Where in the artifact the issue is located */
  location: string;
  /** Specific fix or consideration */
  recommendation: string;
  /** Why this matters */
  rationale: string;
  /** Whether the blocking critique was applied (only for blocking) */
  applied?: boolean;
  /** Reason if a blocking critique was rejected */
  rejectionReason?: string;
};

/**
 * Result from the critique phase.
 */
export type CritiqueResult = {
  /** Blocking critiques that auto-apply */
  blocking: {
    /** Critiques that were applied by chairman */
    applied: CritiqueItem[];
    /** Critiques that were rejected by chairman (with reasons) */
    rejected: CritiqueItem[];
  };
  /** Advisory concerns logged for human review (never auto-applied) */
  advisory: CritiqueItem[];
  /** User confirmation details when confirm mode is used */
  userConfirmation?: {
    prompted: boolean;
    decision: 'apply' | 'skip' | null;
    timestamp: string;
  };
  /** Timing metrics for the critique phase */
  timing?: {
    critiqueStartMs: number;
    critiqueEndMs: number;
    resolveStartMs: number;
    resolveEndMs: number;
  };
};

/**
 * Configuration for the critique phase.
 */
export type CritiqueConfig = {
  /**
   * Enable the adversarial critique loop.
   * When true, adds critique and resolve stages after draft generation.
   */
  enabled: boolean;
  /**
   * Agents to use for critique.
   * If not specified, reuses Stage 1 responders.
   */
  agents?: AgentConfig[];
  /**
   * Chairman for merging critiques.
   * If not specified, reuses the existing chairman.
   */
  chairman?: AgentConfig;
  /**
   * Custom critique prompt template.
   * Use placeholders: ${DRAFT}, ${QUERY}
   * If not specified, uses built-in adversarial review prompt.
   */
  prompt?: string;
  /**
   * Pause for human confirmation before applying blocking critiques.
   * Default: false
   */
  confirm?: boolean;
};
