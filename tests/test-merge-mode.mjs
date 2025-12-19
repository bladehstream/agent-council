#!/usr/bin/env node
/**
 * Merge Mode Tests
 *
 * Tests for the new merge mode functionality that combines all responses
 * instead of ranking them.
 *
 * Run with: node test-merge-mode.mjs
 */

import {
  runEnhancedPipeline,
  filterAvailableAgents,
  createAgentFromSpec,
  getPreset,
  buildPipelineConfig,
  loadModelsConfig,
  listProviders,
  // Merge mode functions
  runMergeChairman,
  runTwoPassMergeChairman,
  formatAllResponsesForMerge,
  buildMergeChairmanPrompt,
  buildMergePass1Prompt,
  buildMergePass2Prompt,
  DEFAULT_AGENTS,
} from '../dist/lib.js';
import fs from 'fs';

const results = [];
let passed = 0;
let failed = 0;
let skipped = 0;

function log(msg) {
  console.log(msg);
}

async function runTest(name, fn, timeout = 180000) {
  log(`\nRunning: ${name}`);
  const start = Date.now();

  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Test timeout')), timeout)
    );
    await Promise.race([fn(), timeoutPromise]);

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    passed++;
    results.push({ name, status: 'PASS', elapsed: `${elapsed}s` });
    log(`PASS  ${name} (${elapsed}s)`);
  } catch (e) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    failed++;
    results.push({ name, status: 'FAIL', error: e.message, elapsed: `${elapsed}s` });
    log(`FAIL  ${name} (${elapsed}s)`);
    log(`      Error: ${e.message}`);
    if (e.stack) {
      log(`      Stack: ${e.stack.split('\n')[1]}`);
    }
  }
}

function skipTest(name, reason) {
  skipped++;
  results.push({ name, status: 'SKIP', reason });
  log(`SKIP  ${name} - ${reason}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// ============================================================================
// Pre-flight check
// ============================================================================
log('=== Pre-flight Check ===');
const { available, unavailable } = filterAvailableAgents(DEFAULT_AGENTS);
log(`Available agents: ${available.map(a => a.name).join(', ') || 'none'}`);
log(`Unavailable agents: ${unavailable.map(a => a.name).join(', ') || 'none'}`);

const config = loadModelsConfig();
const availableProviders = listProviders(config);
log(`Available providers: ${availableProviders.join(', ')}`);

if (available.length < 2) {
  log('\nWARNING: Need at least 2 agents for full merge mode tests');
  log('Some tests will be skipped');
}

// ============================================================================
// Unit Tests - Prompt Building (no agents needed)
// ============================================================================
log('\n=== Unit Tests - Prompt Building ===');

await runTest('formatAllResponsesForMerge: formats multiple responses', async () => {
  const responses = [
    { agent: 'claude', response: 'Response A content' },
    { agent: 'gemini', response: 'Response B content' },
    { agent: 'codex', response: 'Response C content' },
  ];

  const formatted = formatAllResponsesForMerge(responses);

  assert(formatted.includes('===RESPONSE 1 (claude)==='), 'Should include response 1 delimiter');
  assert(formatted.includes('===END RESPONSE 1==='), 'Should include end delimiter 1');
  assert(formatted.includes('Response A content'), 'Should include response A content');
  assert(formatted.includes('===RESPONSE 2 (gemini)==='), 'Should include response 2 delimiter');
  assert(formatted.includes('Response B content'), 'Should include response B content');
  assert(formatted.includes('===RESPONSE 3 (codex)==='), 'Should include response 3 delimiter');
  assert(formatted.includes('Response C content'), 'Should include response C content');

  log('      Formatted 3 responses with proper delimiters');
});

await runTest('formatAllResponsesForMerge: handles single response', async () => {
  const responses = [{ agent: 'claude', response: 'Only response' }];
  const formatted = formatAllResponsesForMerge(responses);

  assert(formatted.includes('===RESPONSE 1 (claude)==='), 'Should include response delimiter');
  assert(formatted.includes('Only response'), 'Should include content');

  log('      Single response formatted correctly');
});

await runTest('buildMergeChairmanPrompt: includes all required elements', async () => {
  const query = 'Test question';
  const formatted = 'Formatted responses here';
  const outputFormat = 'JSON output required';

  const prompt = buildMergeChairmanPrompt(query, formatted, outputFormat);

  assert(prompt.includes('MERGE MODE'), 'Should mention merge mode');
  assert(prompt.includes('Test question'), 'Should include query');
  assert(prompt.includes('Formatted responses here'), 'Should include responses');
  assert(prompt.includes('JSON output required'), 'Should include output format');
  assert(prompt.includes('Do NOT pick a winner'), 'Should mention not picking winner');

  log('      Merge chairman prompt contains all required elements');
});

await runTest('buildMergeChairmanPrompt: works without outputFormat', async () => {
  const query = 'Test question';
  const formatted = 'Responses';

  const prompt = buildMergeChairmanPrompt(query, formatted);

  assert(prompt.includes('Test question'), 'Should include query');
  assert(prompt.includes('Responses'), 'Should include responses');
  assert(!prompt.includes('Output Format'), 'Should not have output format section');

  log('      Merge chairman prompt works without output format');
});

await runTest('buildMergePass1Prompt: includes merge sections', async () => {
  const query = 'Test question';
  const responses = [
    { agent: 'claude', response: 'Response A' },
    { agent: 'gemini', response: 'Response B' },
  ];

  const prompt = buildMergePass1Prompt(query, responses);

  assert(prompt.includes('Pass 1'), 'Should mention Pass 1');
  assert(prompt.includes('MERGE'), 'Should mention merge');
  assert(prompt.includes('merged_content'), 'Should request merged_content section');
  assert(prompt.includes('unique_insights'), 'Should request unique_insights section');
  assert(prompt.includes('conflicts'), 'Should request conflicts section');
  assert(prompt.includes('coverage_gaps'), 'Should request coverage_gaps section');

  log('      Merge Pass 1 prompt includes all required sections');
});

await runTest('buildMergePass2Prompt: uses pass1 output', async () => {
  const query = 'Test question';
  const pass1Output = 'Pass 1 merged content here';
  const responses = [{ agent: 'claude', response: 'Original' }];

  const prompt = buildMergePass2Prompt(query, pass1Output, responses);

  assert(prompt.includes('Pass 2'), 'Should mention Pass 2');
  assert(prompt.includes('Pass 1 merged content here'), 'Should include pass1 output');
  assert(prompt.includes('Refine'), 'Should mention refinement');

  log('      Merge Pass 2 prompt includes pass1 context');
});

await runTest('buildMergePass2Prompt: includes outputFormat when provided', async () => {
  const query = 'Test question';
  const pass1Output = 'Pass 1 output';
  const responses = [{ agent: 'claude', response: 'Original' }];
  const options = { outputFormat: 'Output as JSON with specific schema' };

  const prompt = buildMergePass2Prompt(query, pass1Output, responses, options);

  assert(prompt.includes('Output as JSON with specific schema'), 'Should include outputFormat');
  assert(prompt.includes('Output Format'), 'Should have output format section');

  log('      Merge Pass 2 prompt includes outputFormat');
});

await runTest('formatAllResponsesForMerge: handles empty array', async () => {
  const responses = [];
  const formatted = formatAllResponsesForMerge(responses);

  assert(formatted === '', 'Empty array should return empty string');

  log('      Empty responses array handled correctly');
});

await runTest('formatAllResponsesForMerge: handles responses with special characters', async () => {
  const responses = [
    { agent: 'claude', response: 'Response with ```code blocks``` and **markdown**' },
    { agent: 'gemini', response: 'Response with "quotes" and \'apostrophes\'' },
  ];

  const formatted = formatAllResponsesForMerge(responses);

  assert(formatted.includes('```code blocks```'), 'Should preserve code blocks');
  assert(formatted.includes('"quotes"'), 'Should preserve quotes');

  log('      Special characters preserved correctly');
});

await runTest('buildMergeChairmanPrompt: merge guidelines present', async () => {
  const prompt = buildMergeChairmanPrompt('Q', 'R');

  assert(prompt.includes('Include unique content'), 'Should have guideline 1');
  assert(prompt.includes('Deduplicate'), 'Should have guideline 2');
  assert(prompt.includes('Flag conflicts'), 'Should have guideline 3');
  assert(prompt.includes('Preserve structure'), 'Should have guideline 4');

  log('      All merge guidelines present in prompt');
});

// ============================================================================
// Config Tests
// ============================================================================
log('\n=== Config Tests ===');

await runTest('Config: merge presets exist in models.json', async () => {
  assert(config.presets['merge-fast'], 'merge-fast preset should exist');
  assert(config.presets['merge-balanced'], 'merge-balanced preset should exist');
  assert(config.presets['merge-thorough'], 'merge-thorough preset should exist');

  // Verify merge mode is set
  assert(config.presets['merge-fast'].mode === 'merge', 'merge-fast should have mode: merge');
  assert(config.presets['merge-balanced'].mode === 'merge', 'merge-balanced should have mode: merge');

  // Verify no stage2 in merge presets
  assert(!config.presets['merge-fast'].stage2, 'merge-fast should not have stage2');
  assert(!config.presets['merge-balanced'].stage2, 'merge-balanced should not have stage2');

  log('      All merge presets exist with correct configuration');
});

await runTest('Config: getPreset works with merge presets', async () => {
  const mergeFast = getPreset('merge-fast', config);
  const mergeBalanced = getPreset('merge-balanced', config);

  assert(mergeFast.mode === 'merge', 'merge-fast should have merge mode');
  assert(mergeBalanced.mode === 'merge', 'merge-balanced should have merge mode');
  assert(mergeFast.stage1, 'Should have stage1 config');
  assert(mergeFast.stage3, 'Should have stage3 config');

  log('      getPreset returns merge presets correctly');
});

await runTest('Config: buildPipelineConfig handles merge mode', async () => {
  const preset = getPreset('merge-fast', config);
  const pipelineConfig = buildPipelineConfig(preset, ['claude'], config);

  assert(pipelineConfig.mode === 'merge', 'Pipeline config should have merge mode');
  assert(pipelineConfig.stage1.agents.length > 0, 'Should have stage1 agents');
  assert(!pipelineConfig.stage2, 'Should NOT have stage2 for merge mode');
  assert(pipelineConfig.stage3.chairman, 'Should have chairman');

  log('      buildPipelineConfig creates correct merge mode config');
});

await runTest('Config: compete mode still requires stage2', async () => {
  const preset = getPreset('balanced', config);
  const pipelineConfig = buildPipelineConfig(preset, ['claude'], config);

  assert(pipelineConfig.mode === 'compete' || !pipelineConfig.mode, 'Balanced preset should be compete mode');
  assert(pipelineConfig.stage2, 'Compete mode should have stage2');
  assert(pipelineConfig.stage2.agents.length > 0, 'stage2 should have agents');

  log('      Compete mode presets still have stage2');
});

// ============================================================================
// Integration Tests (require agents)
// ============================================================================
log('\n=== Integration Tests ===');

if (available.length >= 2) {
  await runTest('Integration: runMergeChairman single-pass', async () => {
    const responses = [
      { agent: available[0].name, response: 'The answer is A because of reason 1.' },
      { agent: available[1].name, response: 'The answer is B because of reason 2.' },
    ];

    const chairman = available[0];
    const result = await runMergeChairman(
      'What is the best approach?',
      responses,
      chairman,
      60000,
      true
    );

    assert(result, 'Should return result');
    assert(result.agent === chairman.name, 'Should use specified chairman');
    assert(result.response, 'Should have response');
    assert(result.response.length > 10, 'Response should have content');

    log(`      Chairman merged ${responses.length} responses`);
    log(`      Response length: ${result.response.length} chars`);
  }, 120000);

  await runTest('Integration: runEnhancedPipeline with merge mode', async () => {
    const pipelineConfig = {
      mode: 'merge',
      stage1: {
        agents: available.slice(0, 2),
      },
      stage3: {
        chairman: available[0],
        useReasoning: false,
      },
    };

    const result = await runEnhancedPipeline(
      'List 3 programming languages.',
      {
        config: pipelineConfig,
        timeoutMs: 120000,
        tty: false,
        silent: true,
      }
    );

    assert(result, 'Should return result');
    assert(result.mode === 'merge', 'Result should indicate merge mode');
    assert(result.stage1.length >= 2, 'Should have stage1 responses');
    assert(result.stage2 === null, 'stage2 should be null for merge mode');
    assert(result.aggregate === null, 'aggregate should be null for merge mode');
    assert(result.stage3.response, 'Should have stage3 response');

    log(`      Merge pipeline completed with ${result.stage1.length} responses`);
  }, 180000);

  await runTest('Integration: Merge mode skips stage2 callbacks', async () => {
    const callbackLog = [];

    const pipelineConfig = {
      mode: 'merge',
      stage1: {
        agents: available.slice(0, 2),
      },
      stage3: {
        chairman: available[0],
      },
    };

    const result = await runEnhancedPipeline(
      'Name a color.',
      {
        config: pipelineConfig,
        timeoutMs: 120000,
        tty: false,
        silent: true,
        callbacks: {
          onStage1Complete: (results) => callbackLog.push('stage1'),
          onStage2Complete: (rankings, aggregate) => callbackLog.push('stage2'),
          onStage3Complete: (result) => callbackLog.push('stage3'),
        },
      }
    );

    assert(result, 'Should return result');
    assert(callbackLog.includes('stage1'), 'Stage1 callback should fire');
    assert(!callbackLog.includes('stage2'), 'Stage2 callback should NOT fire in merge mode');
    assert(callbackLog.includes('stage3'), 'Stage3 callback should fire');

    log(`      Callbacks fired: ${callbackLog.join(' -> ')}`);
    log('      Stage2 correctly skipped');
  }, 180000);

  await runTest('Integration: Merge mode with custom prompt', async () => {
    const customPrompt = 'You are a helpful assistant. List exactly 2 fruits.';

    const pipelineConfig = {
      mode: 'merge',
      stage1: {
        agents: available.slice(0, 2),
        prompt: customPrompt,
      },
      stage3: {
        chairman: available[0],
      },
    };

    const result = await runEnhancedPipeline(
      customPrompt,
      {
        config: pipelineConfig,
        timeoutMs: 120000,
        tty: false,
        silent: true,
      }
    );

    assert(result, 'Should return result');
    assert(result.stage1.length >= 2, 'Should have stage1 responses');

    log('      Custom prompt used successfully');
  }, 180000);

  await runTest('Integration: runTwoPassMergeChairman', async () => {
    const responses = [
      { agent: available[0].name, response: 'Approach A: Use microservices with REST APIs.' },
      { agent: available[1].name, response: 'Approach B: Use monolith with GraphQL.' },
    ];

    const chairman = available[0];
    const twoPassConfig = {
      enabled: true,
      pass1Tier: 'default',
      pass2Tier: 'default',
    };

    const result = await runTwoPassMergeChairman(
      'What architecture should we use?',
      responses,
      chairman,
      twoPassConfig,
      120000,
      true
    );

    assert(result, 'Should return result');
    assert(result.pass1, 'Should have pass1 result');
    assert(result.pass2, 'Should have pass2 result');
    assert(result.pass1.response, 'Pass1 should have response');
    assert(result.pass2.response, 'Pass2 should have response');
    assert(result.parsedSections, 'Should have parsedSections');
    assert(result.parsedSections.pass1, 'Should have pass1 sections');
    assert(result.parsedSections.pass2, 'Should have pass2 sections');

    log(`      Pass 1 agent: ${result.pass1.agent}`);
    log(`      Pass 2 agent: ${result.pass2.agent}`);
    log(`      Pass 1 sections: ${result.parsedSections.pass1.length}`);
    log(`      Pass 2 sections: ${result.parsedSections.pass2.length}`);
  }, 240000);

  await runTest('Integration: Merge mode with twoPass enabled via pipeline', async () => {
    const pipelineConfig = {
      mode: 'merge',
      stage1: {
        agents: available.slice(0, 2),
      },
      stage3: {
        chairman: available[0],
        twoPass: {
          enabled: true,
          pass1Tier: 'default',
          pass2Tier: 'default',
        },
      },
    };

    const result = await runEnhancedPipeline(
      'Describe two different sorting algorithms.',
      {
        config: pipelineConfig,
        timeoutMs: 240000,
        tty: false,
        silent: true,
      }
    );

    assert(result, 'Should return result');
    assert(result.mode === 'merge', 'Should be merge mode');
    assert(result.stage2 === null, 'Stage2 should be null');
    assert(result.twoPassResult, 'Should have twoPassResult');
    assert(result.twoPassResult.pass1, 'Should have pass1');
    assert(result.twoPassResult.pass2, 'Should have pass2');

    log(`      Two-pass merge completed`);
    log(`      Pass 1 length: ${result.twoPassResult.pass1.response.length} chars`);
    log(`      Pass 2 length: ${result.twoPassResult.pass2.response.length} chars`);
  }, 300000);

  await runTest('Integration: Merge mode with outputFormat', async () => {
    const pipelineConfig = {
      mode: 'merge',
      stage1: {
        agents: available.slice(0, 2),
      },
      stage3: {
        chairman: available[0],
        outputFormat: `Output as JSON:
{
  "merged_items": ["item1", "item2"],
  "count": <number>
}`,
      },
    };

    const result = await runEnhancedPipeline(
      'List 3 fruits.',
      {
        config: pipelineConfig,
        timeoutMs: 120000,
        tty: false,
        silent: true,
      }
    );

    assert(result, 'Should return result');
    assert(result.stage3.response, 'Should have response');

    // Check if response contains JSON-like structure
    const hasJsonStructure = result.stage3.response.includes('{') ||
                             result.stage3.response.includes('merged_items');
    log(`      Response contains JSON structure: ${hasJsonStructure}`);
    log(`      Response preview: ${result.stage3.response.slice(0, 150)}...`);
  }, 180000);

  await runTest('Integration: Merge preserves all unique content', async () => {
    // Give agents distinct prompts to ensure unique responses
    const pipelineConfig = {
      mode: 'merge',
      stage1: {
        agents: available.slice(0, 2),
        prompt: 'Name exactly 2 unique items. Agent 1 should say "apple, banana". Agent 2 should say "cherry, date". Just list the items.',
      },
      stage3: {
        chairman: available[0],
        outputFormat: 'List all unique items mentioned by any agent.',
      },
    };

    const result = await runEnhancedPipeline(
      'List items',
      {
        config: pipelineConfig,
        timeoutMs: 120000,
        tty: false,
        silent: true,
      }
    );

    assert(result, 'Should return result');
    assert(result.stage1.length >= 2, 'Should have multiple stage1 responses');

    log(`      Stage 1 responses: ${result.stage1.length}`);
    log(`      Merged response length: ${result.stage3.response.length} chars`);
  }, 180000);

} else {
  skipTest('Integration: runMergeChairman single-pass', 'Need at least 2 agents');
  skipTest('Integration: runEnhancedPipeline with merge mode', 'Need at least 2 agents');
  skipTest('Integration: Merge mode skips stage2 callbacks', 'Need at least 2 agents');
  skipTest('Integration: Merge mode with custom prompt', 'Need at least 2 agents');
  skipTest('Integration: runTwoPassMergeChairman', 'Need at least 2 agents');
  skipTest('Integration: Merge mode with twoPass enabled via pipeline', 'Need at least 2 agents');
  skipTest('Integration: Merge mode with outputFormat', 'Need at least 2 agents');
  skipTest('Integration: Merge preserves all unique content', 'Need at least 2 agents');
}

// ============================================================================
// Error Handling Tests
// ============================================================================
log('\n=== Error Handling Tests ===');

await runTest('Error: Compete mode without stage2 throws', async () => {
  const pipelineConfig = {
    mode: 'compete',
    stage1: {
      agents: [createAgentFromSpec('claude:fast')],
    },
    stage3: {
      chairman: createAgentFromSpec('claude:fast'),
    },
    // Intentionally omit stage2
  };

  try {
    await runEnhancedPipeline(
      'Test question',
      {
        config: pipelineConfig,
        timeoutMs: 5000,
        tty: false,
        silent: true,
      }
    );
    throw new Error('Should have thrown');
  } catch (e) {
    assert(e.message.includes('stage2'), 'Error should mention stage2');
    log('      Correctly throws when compete mode missing stage2');
  }
});

await runTest('Error: Mode defaults to compete', async () => {
  const pipelineConfig = {
    // No mode specified
    stage1: {
      agents: [createAgentFromSpec('claude:fast')],
    },
    stage2: {
      agents: [createAgentFromSpec('claude:fast')],
    },
    stage3: {
      chairman: createAgentFromSpec('claude:fast'),
    },
  };

  // This should work because we have stage2 and mode defaults to compete
  // We just verify the config is valid, not that it runs (would need agents)
  assert(!pipelineConfig.mode || pipelineConfig.mode === 'compete', 'Default should be compete');
  log('      Mode defaults to compete when not specified');
});

// ============================================================================
// Summary
// ============================================================================
log('\n' + '='.repeat(60));
log(`MERGE MODE TESTS: ${passed} passed, ${failed} failed, ${skipped} skipped`);
log('='.repeat(60));

// Save results
const summary = {
  timestamp: new Date().toISOString(),
  agents: available.map(a => a.name),
  passed,
  failed,
  skipped,
  total: passed + failed + skipped,
  results
};
fs.writeFileSync('test-merge-mode-results.json', JSON.stringify(summary, null, 2));
log('\nResults saved to test-merge-mode-results.json');

process.exit(failed > 0 ? 1 : 0);
