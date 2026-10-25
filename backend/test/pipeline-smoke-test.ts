/**
 * Standalone smoke test for the detection + explanation pipeline, run
 * without Nest's DI container or Prisma (useful in sandboxes where the
 * Prisma engine binary can't be downloaded). Clones a small real repo,
 * runs the ESLint layer, then the LLM layer, and prints the results.
 *
 * Run with: npx ts-node test/pipeline-smoke-test.ts
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import simpleGit from 'simple-git';
import { EslintRunnerService } from '../src/scan/eslint-runner.service';
import { LlmService } from '../src/scan/llm.service';

async function main() {
  const repoUrlOrLocalDir = process.argv[2] || 'https://github.com/sindresorhus/is-odd';
  const isLocalDir = fs.existsSync(repoUrlOrLocalDir);
  const workDir = isLocalDir
    ? repoUrlOrLocalDir
    : fs.mkdtempSync(path.join(os.tmpdir(), 'codesentinel-smoke-'));

  try {
    if (isLocalDir) {
      console.log(`Scanning local directory: ${workDir}`);
    } else {
      console.log(`Cloning ${repoUrlOrLocalDir} -> ${workDir}`);
      await simpleGit().clone(repoUrlOrLocalDir, workDir, ['--depth', '1']);
    }

    const eslintRunner = new EslintRunnerService();
    const rawIssues = await eslintRunner.run(workDir);
    console.log(`\nESLint layer found ${rawIssues.length} issue(s).`);

    const llm = new LlmService();
    const explained = await llm.explainAll(rawIssues);

    for (const issue of explained) {
      console.log('\n----------------------------------------');
      console.log(`${issue.filePath}:${issue.line}  [${issue.ruleId}]  severity=${issue.severity}`);
      console.log(`lint message: ${issue.message}`);
      console.log(`explanation:  ${issue.explanation}`);
      console.log(`suggestedFix: ${issue.suggestedFix}`);
    }

    console.log('\n----------------------------------------');
    console.log(`Done. ${explained.length} issue(s) explained.`);
    console.log(
      process.env.ANTHROPIC_API_KEY
        ? '(Used live Anthropic API for explanations.)'
        : '(No ANTHROPIC_API_KEY set — used mock explainer fallback.)',
    );
  } finally {
    if (!isLocalDir) {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  }
}

main().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
