#!/usr/bin/env node
/**
 * Real-World Test Suite
 *
 * Contract, Integration, and Smoke tests that verify actual CLI behavior.
 * These tests call real CLIs and require them to be installed and configured.
 *
 * Run with: node tests/test-real-world.mjs
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const results = [];
let passed = 0;
let failed = 0;
let skipped = 0;

function log(msg) {
  console.log(msg);
}

function test(name, fn) {
  return { name, fn };
}

function skip(name, reason) {
  return { name, skip: true, reason };
}

async function runTest(t) {
  if (t.skip) {
    skipped++;
    results.push({ name: t.name, status: 'SKIP', reason: t.reason });
    log(`SKIP  ${t.name}${t.reason ? ` (${t.reason})` : ''}`);
    return;
  }

  try {
    await t.fn();
    passed++;
    results.push({ name: t.name, status: 'PASS' });
    log(`PASS  ${t.name}`);
  } catch (e) {
    failed++;
    results.push({ name: t.name, status: 'FAIL', error: e.message });
    log(`FAIL  ${t.name}`);
    log(`      Error: ${e.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/**
 * Check if a CLI command exists
 */
function commandExists(cmd) {
  const result = spawnSync('which', [cmd], { stdio: 'pipe' });
  return result.status === 0;
}

/**
 * Run a command and capture output with timeout
 */
function runCommand(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const timeout = options.timeout || 30000;
    const child = spawn(cmd, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options.spawnOptions
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
      reject(new Error(`Command timed out after ${timeout}ms`));
    }, timeout);

    child.stdout?.on('data', (data) => { stdout += data.toString(); });
    child.stderr?.on('data', (data) => { stderr += data.toString(); });

    if (options.stdin) {
      child.stdin.write(options.stdin);
      child.stdin.end();
    }

    child.on('close', (code) => {
      clearTimeout(timer);
      if (!killed) {
        resolve({ code, stdout, stderr });
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// Detect available CLIs
const hasClaude = commandExists('claude');
const hasGemini = commandExists('gemini');
const hasCodex = commandExists('codex');

log('=== CLI Availability ===');
log(`claude: ${hasClaude ? 'available' : 'NOT FOUND'}`);
log(`gemini: ${hasGemini ? 'available' : 'NOT FOUND'}`);
log(`codex: ${hasCodex ? 'available' : 'NOT FOUND'}`);

// Load models.json to verify against
const modelsConfig = JSON.parse(readFileSync('models.json', 'utf8'));

// ============================================================================
// Category 1: Contract Tests - CLI Help Output Verification
// ============================================================================
log('\n=== Category 1: Contract Tests - CLI Flags Exist ===');

await runTest(hasClaude
  ? test('1.1 Claude CLI accepts --print flag', async () => {
      const result = await runCommand('claude', ['--help'], { timeout: 10000 });
      assert(result.stdout.includes('--print') || result.stdout.includes('-p'),
        'Claude --help should mention --print flag');
    })
  : skip('1.1 Claude CLI accepts --print flag', 'claude not installed'));

await runTest(hasClaude
  ? test('1.2 Claude CLI accepts --output-format flag', async () => {
      const result = await runCommand('claude', ['--help'], { timeout: 10000 });
      assert(result.stdout.includes('--output-format') || result.stdout.includes('output-format'),
        'Claude --help should mention --output-format flag');
    })
  : skip('1.2 Claude CLI accepts --output-format flag', 'claude not installed'));

await runTest(hasClaude
  ? test('1.3 Claude CLI accepts --allowedTools flag', async () => {
      const result = await runCommand('claude', ['--help'], { timeout: 10000 });
      assert(result.stdout.includes('--allowedTools') || result.stdout.includes('allowedTools'),
        'Claude --help should mention --allowedTools flag');
    })
  : skip('1.3 Claude CLI accepts --allowedTools flag', 'claude not installed'));

await runTest(hasGemini
  ? test('1.4 Gemini CLI accepts --output-format flag', async () => {
      const result = await runCommand('gemini', ['--help'], { timeout: 10000 });
      assert(result.stdout.includes('--output-format') || result.stdout.includes('output-format'),
        'Gemini --help should mention --output-format flag');
    })
  : skip('1.4 Gemini CLI accepts --output-format flag', 'gemini not installed'));

await runTest(hasGemini
  ? test('1.5 Gemini CLI accepts --model flag', async () => {
      const result = await runCommand('gemini', ['--help'], { timeout: 10000 });
      assert(result.stdout.includes('--model') || result.stdout.includes('-m'),
        'Gemini --help should mention --model flag');
    })
  : skip('1.5 Gemini CLI accepts --model flag', 'gemini not installed'));

await runTest(hasCodex
  ? test('1.6 Codex CLI has exec subcommand', async () => {
      const result = await runCommand('codex', ['--help'], { timeout: 10000 });
      assert(result.stdout.includes('exec'),
        'Codex --help should mention exec subcommand');
    })
  : skip('1.6 Codex CLI has exec subcommand', 'codex not installed'));

await runTest(hasCodex
  ? test('1.7 Codex exec accepts --skip-git-repo-check', async () => {
      const result = await runCommand('codex', ['exec', '--help'], { timeout: 10000 });
      assert(result.stdout.includes('--skip-git-repo-check') || result.stdout.includes('skip-git-repo-check'),
        'Codex exec --help should mention --skip-git-repo-check flag');
    })
  : skip('1.7 Codex exec accepts --skip-git-repo-check', 'codex not installed'));

await runTest(hasCodex
  ? test('1.8 Codex exec accepts --model flag', async () => {
      const result = await runCommand('codex', ['exec', '--help'], { timeout: 10000 });
      assert(result.stdout.includes('--model') || result.stdout.includes('-m'),
        'Codex exec --help should mention --model flag');
    })
  : skip('1.8 Codex exec accepts --model flag', 'codex not installed'));

// ============================================================================
// Category 2: Contract Tests - Model Name Validation
// ============================================================================
log('\n=== Category 2: Contract Tests - Model Names Valid ===');

await runTest(hasGemini
  ? test('2.1 Gemini model list includes configured models', async () => {
      const result = await runCommand('gemini', ['model', 'list'], { timeout: 30000 });
      const output = result.stdout + result.stderr;
      const geminiModels = modelsConfig.providers.gemini.tiers;

      // Check that at least the base model names appear
      assert(output.includes('gemini-2.5-flash') || output.includes('2.5-flash'),
        'Gemini model list should include flash models');
      assert(output.includes('gemini-2.5-pro') || output.includes('2.5-pro'),
        'Gemini model list should include pro models');
    })
  : skip('2.1 Gemini model list includes configured models', 'gemini not installed'));

await runTest(hasClaude
  ? test('2.2 Claude accepts haiku model name', async () => {
      // Just verify the CLI doesn't immediately reject the model name
      // We use a minimal prompt to avoid long execution
      const result = await runCommand('claude', [
        '--print', '--output-format', 'text', '--model', 'haiku', '--max-turns', '1'
      ], { stdin: 'Reply with just the word OK', timeout: 30000 });
      // Success if it didn't error with "invalid model"
      assert(!result.stderr.includes('invalid model') && !result.stderr.includes('unknown model'),
        'Claude should accept haiku as a model name');
    })
  : skip('2.2 Claude accepts haiku model name', 'claude not installed'));

await runTest(hasClaude
  ? test('2.3 Claude accepts sonnet model name', async () => {
      const result = await runCommand('claude', [
        '--print', '--output-format', 'text', '--model', 'sonnet', '--max-turns', '1'
      ], { stdin: 'Reply with just the word OK', timeout: 30000 });
      assert(!result.stderr.includes('invalid model') && !result.stderr.includes('unknown model'),
        'Claude should accept sonnet as a model name');
    })
  : skip('2.3 Claude accepts sonnet model name', 'claude not installed'));

await runTest(hasClaude
  ? test('2.4 Claude accepts opus model name', async () => {
      const result = await runCommand('claude', [
        '--print', '--output-format', 'text', '--model', 'opus', '--max-turns', '1'
      ], { stdin: 'Reply with just the word OK', timeout: 30000 });
      assert(!result.stderr.includes('invalid model') && !result.stderr.includes('unknown model'),
        'Claude should accept opus as a model name');
    })
  : skip('2.4 Claude accepts opus model name', 'claude not installed'));

await runTest(hasClaude
  ? test('2.5 Claude WebSearch tool works with correct flags', async () => {
      const result = await runCommand('claude', [
        '--print', '--output-format', 'text', '--model', 'haiku',
        '--tools', 'WebSearch', '--allowedTools', 'WebSearch', '--max-turns', '3'
      ], { stdin: 'Search the web and tell me one news headline from today. Be brief.', timeout: 60000 });
      assert(result.code === 0, `Claude should exit with code 0, got ${result.code}`);
      // Web search results typically include "Sources:" or actual content
      const output = result.stdout.toLowerCase();
      assert(
        output.includes('source') || output.includes('http') || output.includes('news') || output.length > 50,
        'Claude with WebSearch should return web-sourced content'
      );
    })
  : skip('2.5 Claude WebSearch tool works with correct flags', 'claude not installed'));

// ============================================================================
// Category 3: Integration Tests - Basic Agent Calls
// ============================================================================
log('\n=== Category 3: Integration Tests - Agent Invocation ===');

await runTest(hasClaude
  ? test('3.1 Claude responds to simple prompt', async () => {
      const result = await runCommand('claude', [
        '--print', '--output-format', 'text', '--model', 'haiku', '--max-turns', '1'
      ], { stdin: 'What is 2+2? Reply with just the number.', timeout: 60000 });
      assert(result.code === 0, `Claude should exit with code 0, got ${result.code}`);
      assert(result.stdout.length > 0, 'Claude should produce output');
      assert(result.stdout.includes('4'), 'Claude should answer 2+2=4');
    })
  : skip('3.1 Claude responds to simple prompt', 'claude not installed'));

await runTest(hasGemini
  ? test('3.2 Gemini responds to simple prompt', async () => {
      const result = await runCommand('gemini', [
        '--output-format', 'text', '--model', 'gemini-2.5-flash',
        'What is 2+2? Reply with just the number.'
      ], { timeout: 60000 });
      assert(result.code === 0, `Gemini should exit with code 0, got ${result.code}`);
      assert(result.stdout.length > 0, 'Gemini should produce output');
      assert(result.stdout.includes('4'), 'Gemini should answer 2+2=4');
    })
  : skip('3.2 Gemini responds to simple prompt', 'gemini not installed'));

await runTest(hasCodex
  ? test('3.3 Codex responds to simple prompt', async () => {
      const result = await runCommand('codex', [
        'exec', '--skip-git-repo-check', '--model', 'gpt-5.1-codex-mini',
        'What is 2+2? Reply with just the number.'
      ], { timeout: 60000 });
      assert(result.code === 0, `Codex should exit with code 0, got ${result.code}`);
      assert(result.stdout.length > 0, 'Codex should produce output');
      assert(result.stdout.includes('4'), 'Codex should answer 2+2=4');
    })
  : skip('3.3 Codex responds to simple prompt', 'codex not installed'));

// ============================================================================
// Category 4: Integration Tests - Model Config Generates Valid Commands
// ============================================================================
log('\n=== Category 4: Integration Tests - Generated Commands ===');

const lib = await import('../dist/lib.js');

await runTest(hasClaude
  ? test('4.1 createAgentConfig generates working claude command', async () => {
      const agent = lib.createAgentConfig('claude', 'fast');
      const [cmd, ...args] = agent.command;

      // Add max-turns to limit execution time
      const testArgs = [...args, '--max-turns', '1'];

      const result = await runCommand(cmd, testArgs, {
        stdin: 'Say OK',
        timeout: 60000
      });
      assert(result.code === 0, `Generated claude command should work, got exit code ${result.code}: ${result.stderr}`);
    })
  : skip('4.1 createAgentConfig generates working claude command', 'claude not installed'));

await runTest(hasGemini
  ? test('4.2 createAgentConfig generates working gemini command', async () => {
      const agent = lib.createAgentConfig('gemini', 'fast');
      const [cmd, ...args] = agent.command;

      // Append the prompt as positional arg
      const testArgs = [...args, 'Say OK'];

      const result = await runCommand(cmd, testArgs, { timeout: 60000 });
      assert(result.code === 0, `Generated gemini command should work, got exit code ${result.code}: ${result.stderr}`);
    })
  : skip('4.2 createAgentConfig generates working gemini command', 'gemini not installed'));

await runTest(hasCodex
  ? test('4.3 createAgentConfig generates working codex command', async () => {
      const agent = lib.createAgentConfig('codex', 'fast');
      const [cmd, ...args] = agent.command;

      // Append the prompt as positional arg
      const testArgs = [...args, 'Say OK'];

      const result = await runCommand(cmd, testArgs, { timeout: 60000 });
      assert(result.code === 0, `Generated codex command should work, got exit code ${result.code}: ${result.stderr}`);
    })
  : skip('4.3 createAgentConfig generates working codex command', 'codex not installed'));

// ============================================================================
// Category 5: Smoke Tests - End-to-End Pipeline
// ============================================================================
log('\n=== Category 5: Smoke Tests - End-to-End ===');

const availableAgentCount = [hasClaude, hasGemini, hasCodex].filter(Boolean).length;

await runTest(availableAgentCount >= 2
  ? test('5.1 Full pipeline runs with real agents', async () => {
      // Run the CLI with a simple question
      const result = await runCommand('node', [
        'dist/index.js',
        'What is the capital of France? Reply in one word.',
        '--preset', 'fast',
        '--timeout', '60'
      ], { timeout: 180000 }); // 3 minute timeout for full pipeline

      assert(result.code === 0, `Pipeline should complete successfully, got exit code ${result.code}`);
      assert(result.stdout.includes('Paris') || result.stdout.includes('paris'),
        'Pipeline output should include correct answer');
    })
  : skip('5.1 Full pipeline runs with real agents', `need 2+ agents, have ${availableAgentCount}`));

await runTest(availableAgentCount >= 1
  ? test('5.2 Pipeline handles single question end-to-end', async () => {
      // Use runCouncilPipeline directly
      const { available } = lib.filterAvailableAgents(lib.DEFAULT_AGENTS);

      if (available.length === 0) {
        throw new Error('No agents available');
      }

      const chairman = lib.pickChairman(available);
      const result = await lib.runCouncilPipeline(
        'What color is the sky? Reply in one word.',
        available,
        chairman,
        { timeoutMs: 60000, tty: false }
      );

      assert(result !== null, 'Pipeline should return a result');
      assert(result.stage1.length > 0, 'Stage 1 should have responses');
      assert(result.stage3, 'Stage 3 should have chairman response');
    })
  : skip('5.2 Pipeline handles single question end-to-end', 'no agents available'));

// ============================================================================
// Summary
// ============================================================================
log('\n============================================================');
log(`REAL-WORLD TESTS: ${passed} passed, ${failed} failed, ${skipped} skipped`);
log('============================================================\n');

// Write results to file
import { writeFileSync } from 'node:fs';
writeFileSync('test-real-world-results.json', JSON.stringify({
  summary: { passed, failed, skipped },
  results,
  availability: { claude: hasClaude, gemini: hasGemini, codex: hasCodex }
}, null, 2));
log('Results saved to test-real-world-results.json');

// Exit with error code if any tests failed
process.exit(failed > 0 ? 1 : 0);
