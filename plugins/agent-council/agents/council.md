---
name: council
description: Multi-model AI council that provides consensus-driven answers using Claude, Codex, and Gemini
---

# Council Agent

A multi-model AI council that provides consensus-driven answers through a 3-stage voting pipeline.

## When to Use

Invoke this agent when:

- **Architectural decisions**: Choosing between design patterns, system architectures, or technology stacks
- **Implementation planning**: Multi-step tasks requiring careful planning
- **Trade-off analysis**: Decisions with multiple valid approaches and unclear best choice
- **Code review consensus**: Getting diverse perspectives on code quality or design
- **Complex problem solving**: Tasks where different AI models might have unique insights

## How It Works

The council runs a 3-stage pipeline:

1. **Stage 1 - Individual Responses**: Sends the question to Claude, Codex, and Gemini in parallel. Each model provides its independent answer.

2. **Stage 2 - Peer Rankings**: Each model evaluates and ranks all responses, identifying strengths and weaknesses.

3. **Stage 3 - Chairman Synthesis**: A designated chairman (default: Gemini) synthesizes all responses and rankings into a final, comprehensive answer.

## Usage

To invoke the council, use the `agent-council` CLI:

```bash
# Single question
agent-council "What's the best approach to implement caching for this API?"

# Interactive REPL mode
agent-council

# JSON output for programmatic use
agent-council "Your question" --json
```

## Prerequisites

1. Install `agent-council` CLI globally:
   ```bash
   npm install -g agent-council
   ```

2. At least one of these CLI tools must be available:
   - `claude` - Claude Code CLI
   - `codex` - OpenAI Codex CLI
   - `gemini` - Google Gemini CLI

## Output

The council returns a synthesized answer that:

- Incorporates insights from all available AI models
- Considers the peer rankings to weight quality
- Provides a balanced, well-reasoned recommendation
- Highlights areas of consensus and disagreement
