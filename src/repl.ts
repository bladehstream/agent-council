import readline from "node:readline";
import chalk from "chalk";
import { buildQuestionWithHistory } from "./prompts.js";
import { printFinal, runCouncilPipeline } from "./pipeline.js";
import type { AgentConfig, ConversationEntry, SessionState } from "./types.js";

const VERSION = "0.1.0";

function showWelcome(agents: AgentConfig[], chairman: AgentConfig): void {
  console.log(chalk.bold(`\nAgent Council v${VERSION}`));
  console.log(`Available agents: ${agents.map((a) => a.name).join(", ")}`);
  console.log(`Chairman: ${chairman.name}`);
  console.log(chalk.gray("Type /help for commands, /exit to quit.\n"));
}

function showHelp(): void {
  console.log(chalk.bold("\nAvailable Commands:"));
  console.log("  /help              Show this help message");
  console.log("  /exit, /quit       Exit the REPL");
  console.log("  /agents            List available agents");
  console.log("  /chairman <name>   Change the chairman agent");
  console.log("  /timeout <seconds> Set per-agent timeout (0 = no timeout)");
  console.log("  /clear             Clear conversation history");
  console.log("  /history           Show conversation history");
  console.log();
}

function showAgents(state: SessionState): void {
  console.log(chalk.bold("\nAvailable Agents:"));
  for (const agent of state.agents) {
    const isChairman = agent.name === state.chairman.name;
    const marker = isChairman ? chalk.yellow(" (chairman)") : "";
    console.log(`  - ${agent.name}${marker}`);
  }
  console.log();
}

function showHistory(state: SessionState): void {
  if (state.history.length === 0) {
    console.log(chalk.gray("\nNo conversation history.\n"));
    return;
  }
  console.log(chalk.bold(`\nConversation History (${state.history.length} entries):`));
  for (let i = 0; i < state.history.length; i++) {
    const entry = state.history[i];
    console.log(chalk.cyan(`\n[${i + 1}] Q: ${entry.question}`));
    console.log(`    A: ${entry.stage3Response.slice(0, 100)}${entry.stage3Response.length > 100 ? "..." : ""}`);
  }
  console.log();
}

function handleCommand(input: string, state: SessionState): boolean {
  const parts = input.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  switch (cmd) {
    case "/help":
      showHelp();
      return true;

    case "/exit":
    case "/quit":
      console.log(chalk.green("\nGoodbye!\n"));
      process.exit(0);

    case "/agents":
      showAgents(state);
      return true;

    case "/chairman": {
      const name = args[0];
      if (!name) {
        console.log(chalk.yellow(`Current chairman: ${state.chairman.name}`));
        console.log(chalk.gray("Usage: /chairman <agent-name>"));
        return true;
      }
      const agent = state.agents.find((a) => a.name.toLowerCase() === name.toLowerCase());
      if (!agent) {
        console.log(chalk.red(`Unknown agent: ${name}`));
        console.log(`Available: ${state.agents.map((a) => a.name).join(", ")}`);
        return true;
      }
      state.chairman = agent;
      console.log(chalk.green(`Chairman changed to: ${agent.name}`));
      return true;
    }

    case "/timeout": {
      const seconds = parseInt(args[0], 10);
      if (isNaN(seconds) || seconds < 0) {
        console.log(chalk.yellow(`Current timeout: ${state.timeoutMs ? state.timeoutMs / 1000 + "s" : "none"}`));
        console.log(chalk.gray("Usage: /timeout <seconds> (0 = no timeout)"));
        return true;
      }
      state.timeoutMs = seconds === 0 ? undefined : seconds * 1000;
      console.log(chalk.green(`Timeout set to: ${seconds === 0 ? "none" : seconds + "s"}`));
      return true;
    }

    case "/clear":
      state.history = [];
      console.log(chalk.green("Conversation history cleared."));
      return true;

    case "/history":
      showHistory(state);
      return true;

    default:
      console.log(chalk.red(`Unknown command: ${cmd}`));
      console.log(chalk.gray("Type /help for available commands."));
      return true;
  }
}

export async function startRepl(agents: AgentConfig[], chairman: AgentConfig): Promise<void> {
  const state: SessionState = {
    history: [],
    agents,
    chairman,
    timeoutMs: undefined,
  };

  showWelcome(agents, chairman);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "> ",
  });

  const useTty = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  const processInput = async (line: string): Promise<void> => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    if (input.startsWith("/")) {
      handleCommand(input, state);
      rl.prompt();
      return;
    }

    // Build question with history context
    const questionWithHistory = buildQuestionWithHistory(input, state.history);

    console.log();

    // Run the council pipeline
    const result = await runCouncilPipeline(questionWithHistory, state.agents, state.chairman, {
      timeoutMs: state.timeoutMs,
      tty: useTty,
    });

    if (result) {
      // Print results
      printFinal(result.stage1, result.stage2, result.aggregate, result.stage3);

      // Save to history
      state.history.push({
        question: input,
        stage1: result.stage1,
        stage3Response: result.stage3.response,
      });
    }

    console.log();
    rl.prompt();
  };

  rl.on("line", (line) => {
    processInput(line).catch((err) => {
      console.error(chalk.red("Error:"), err.message);
      rl.prompt();
    });
  });

  rl.on("close", () => {
    console.log(chalk.green("\nGoodbye!\n"));
    process.exit(0);
  });

  // Handle Ctrl+C - don't exit, just show new prompt
  rl.on("SIGINT", () => {
    console.log(chalk.yellow("\n(Use /exit to quit)"));
    rl.prompt();
  });

  rl.prompt();
}
