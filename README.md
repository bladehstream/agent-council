# Agent Council

A multi-agent AI consensus engine that orchestrates Claude, Codex, and Gemini to provide collaborative, cross-validated answers through a three-stage deliberation process.

This fork adds a **programmatic API** for integration into larger automation workflows.

## Features

- **Multi-Agent Consensus**: Combines responses from multiple AI models for more reliable answers
- **Peer Validation**: Agents anonymously rank each other's responses to surface quality
- **Chairman Synthesis**: A designated agent synthesizes the final answer from all inputs
- **Programmatic API**: Full library exports for embedding in applications
- **Stage Callbacks**: Hook into pipeline stages for progress tracking and checkpointing
- **Silent Mode**: Suppress console output for clean programmatic usage
- **Custom Agents**: Add any CLI-based AI tool as a council member

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                         AGENT COUNCIL                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Stage 1: Individual Responses (Parallel)                       │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                         │
│  │  Codex  │  │ Claude  │  │ Gemini  │                         │
│  └────┬────┘  └────┬────┘  └────┬────┘                         │
│       │            │            │                               │
│       ▼            ▼            ▼                               │
│  Stage 2: Peer Rankings (Parallel, Anonymized)                  │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                         │
│  │ Rank:   │  │ Rank:   │  │ Rank:   │                         │
│  │ B > A > C│  │ A > B > C│  │ B > A > C│                       │
│  └────┬────┘  └────┬────┘  └────┬────┘                         │
│       │            │            │                               │
│       └────────────┼────────────┘                               │
│                    ▼                                            │
│  Stage 3: Chairman Synthesis                                    │
│  ┌─────────────────────────────────────┐                       │
│  │  Chairman (Gemini) synthesizes      │                       │
│  │  final answer from all responses    │                       │
│  │  and peer rankings                  │                       │
│  └─────────────────────────────────────┘                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Installation

### From Source

```bash
git clone https://github.com/bladehstream/agent-council-testing.git
cd agent-council-testing
npm install
npm run build
```

### Prerequisites

At least 2 of the following AI CLI tools must be installed and authenticated:

| Tool | Installation | Authentication |
|------|-------------|----------------|
| Claude | `npm install -g @anthropic-ai/claude-code` | `claude auth` |
| Codex | `npm install -g @openai/codex` | `codex auth` |
| Gemini | `npm install -g @google/gemini-cli` | `gemini auth` |

Verify your setup:
```bash
node -e "import('./dist/lib.js').then(({filterAvailableAgents, DEFAULT_AGENTS}) => {
  const {available} = filterAvailableAgents(DEFAULT_AGENTS);
  console.log('Available:', available.map(a => a.name).join(', '));
})"
```

## Quick Start

### CLI Usage

```bash
# Single question
./dist/index.js "What's the best database for real-time analytics?"

# With JSON output
./dist/index.js "Explain microservices" --json

# With timeout (seconds per agent)
./dist/index.js "Complex question" --timeout 120

# Specify chairman
./dist/index.js "Question" --chairman claude

# Interactive REPL mode
./dist/index.js
```

### Programmatic Usage

```typescript
import {
  runCouncilPipeline,
  filterAvailableAgents,
  pickChairman,
  DEFAULT_AGENTS,
} from 'agent-council';

// Check available agents
const { available } = filterAvailableAgents(DEFAULT_AGENTS);
const chairman = pickChairman(available);

// Run the council
const result = await runCouncilPipeline(
  "What's the best approach for authentication?",
  available,
  chairman,
  { tty: false, silent: true }
);

if (result) {
  console.log('Final answer:', result.stage3.response);
  console.log('Aggregate ranking:', result.aggregate);
}
```

## Programmatic API

### Core Exports

```typescript
// Pipeline
runCouncilPipeline(question, agents, chairman, options)
pickChairman(agents, preferredName?)
extractStage1(agentStates)
extractStage2(agentStates)
calculateAggregateRankings(stage2Results, labelMap)
runChairman(query, stage1, stage2, chairman, timeoutMs, silent?)

// Agents
filterAvailableAgents(agents)  // Returns { available, unavailable }
callAgent(state, prompt, timeoutMs)
commandExists(command)
DEFAULT_AGENTS
DEFAULT_CHAIRMAN

// Prompts
buildQuestionWithHistory(question, history)
buildRankingPrompt(query, stage1Results)
buildChairmanPrompt(query, stage1, stage2)
parseRankingFromText(text)
MAX_HISTORY_ENTRIES

// Types
AgentConfig, AgentState, AgentStatus
Stage1Result, Stage2Result, Stage3Result
PipelineResult, PipelineOptions, PipelineCallbacks
FilterResult, ConversationEntry, SessionState
```

### Pipeline Options

```typescript
interface PipelineOptions {
  tty: boolean;              // Enable interactive TTY rendering
  silent?: boolean;          // Suppress console output (default: false)
  timeoutMs?: number;        // Per-agent timeout in milliseconds
  callbacks?: PipelineCallbacks;
}

interface PipelineCallbacks {
  onStage1Complete?: (results: Stage1Result[]) => void | Promise<void>;
  onStage2Complete?: (results: Stage2Result[], aggregate: AggregateRanking[]) => void | Promise<void>;
  onStage3Complete?: (result: Stage3Result) => void | Promise<void>;
}
```

### Stage Callbacks

Use callbacks for progress tracking, logging, or checkpointing:

```typescript
const result = await runCouncilPipeline(question, agents, chairman, {
  tty: false,
  silent: true,
  callbacks: {
    onStage1Complete: (results) => {
      console.log(`Got ${results.length} individual responses`);
    },
    onStage2Complete: async (rankings, aggregate) => {
      console.log(`Top ranked: ${aggregate[0]?.agent}`);
      await saveCheckpoint({ rankings, aggregate });
    },
    onStage3Complete: (result) => {
      console.log(`Chairman ${result.agent} completed synthesis`);
    },
  },
});
```

### Conversation History

```typescript
import { buildQuestionWithHistory, type ConversationEntry } from 'agent-council';

const history: ConversationEntry[] = [];

// First question
const result1 = await runCouncilPipeline("What database should I use?", ...);
history.push({
  question: "What database should I use?",
  stage1: result1.stage1,
  stage3Response: result1.stage3.response,
});

// Follow-up with context (last 5 entries included)
const followUp = buildQuestionWithHistory("What about cost?", history);
const result2 = await runCouncilPipeline(followUp, ...);
```

### Custom Agents

```typescript
const customAgents: AgentConfig[] = [
  {
    name: "ollama-llama",
    command: ["ollama", "run", "llama2"],
    promptViaStdin: true,
  },
  {
    name: "ollama-mistral",
    command: ["ollama", "run", "mistral"],
    promptViaStdin: true,
  },
];

const result = await runCouncilPipeline(
  "Your question",
  customAgents,
  customAgents[0],
  { tty: false, silent: true }
);
```

## Testing

```bash
# Unit tests (no agents required)
node test-runner.mjs

# Integration tests (requires 2+ agents)
node test-pipeline.mjs
```

See [TEST_RECORD.md](./TEST_RECORD.md) for detailed test documentation.

## CLI Reference

### Single Question Mode

```bash
agent-council "Your question" [options]

Options:
  --chairman <name>   Which agent synthesizes the final answer
  --timeout <seconds> Per-agent timeout (0 = no timeout)
  --json              Output results as JSON
  --help              Show help
  --version           Show version
```

### Interactive REPL Mode

```bash
agent-council  # No arguments starts REPL

Commands:
  /help              Show available commands
  /agents            List available agents
  /chairman [name]   Show or set chairman
  /timeout [seconds] Show or set timeout
  /history           Show conversation history
  /clear             Clear conversation history
  /exit              Exit the REPL
```

### Keyboard Controls (TTY Mode)

| Key | Action |
|-----|--------|
| `1`, `2`, `3` | Focus agent N |
| `↑` / `↓` | Navigate focus |
| `k` | Kill focused agent |
| `ESC` | Abort all agents |
| `Ctrl+C` | Quit |

## Project Structure

```
agent-council/
├── src/
│   ├── lib.ts          # Public API exports
│   ├── pipeline.ts     # Core 3-stage orchestration
│   ├── agents.ts       # Agent spawning and management
│   ├── prompts.ts      # Prompt construction
│   ├── types.ts        # TypeScript definitions
│   ├── repl.ts         # Interactive REPL mode
│   └── index.ts        # CLI entry point
├── dist/               # Compiled JavaScript + declarations
├── test-runner.mjs     # Unit test suite
├── test-pipeline.mjs   # Integration test suite
├── QUICKSTART.md       # Setup and usage guide
├── TEST_RECORD.md      # Test documentation
└── package.json
```

## Documentation

- [QUICKSTART.md](./QUICKSTART.md) - Setup, testing, and usage examples
- [TEST_RECORD.md](./TEST_RECORD.md) - Test suite documentation and results

## License

MIT

## Credits

- Original project: [mylukin/agent-council](https://github.com/mylukin/agent-council)
- This fork: [bladehstream/agent-council-testing](https://github.com/bladehstream/agent-council-testing)
