import { Injectable, Logger } from '@nestjs/common';
import { ESLint } from 'eslint';
import * as fs from 'fs';
import * as path from 'path';
const tsParserPath = require.resolve('@typescript-eslint/parser');

export interface RawLintIssue {
  filePath: string;
  line: number;
  column: number;
  ruleId: string;
  message: string;
  codeSnippet: string;
}

/**
 * Deterministic detection layer. This is the ONLY component allowed to
 * flag issues. The LLM layer (llm.service.ts) never decides what counts
 * as a problem — it only explains/prioritizes what this layer finds.
 */
@Injectable()
export class EslintRunnerService {
  private readonly logger = new Logger(EslintRunnerService.name);

  async run(repoDir: string): Promise<RawLintIssue[]> {
    const files = this.collectSourceFiles(repoDir);
    if (files.length === 0) {
      return [];
    }

    const eslint = new ESLint({
      cwd: repoDir,
      useEslintrc: false,
      resolvePluginsRelativeTo: path.resolve(__dirname, '..', '..'),
      baseConfig: {
        parser: tsParserPath,
        parserOptions: {
          ecmaVersion: 2021,
          sourceType: 'module',
          ecmaFeatures: { jsx: true },
        },
        plugins: ['@typescript-eslint'],
        env: { es2021: true, node: true, browser: true },
        rules: {
          'no-unused-vars': 'off',
          '@typescript-eslint/no-unused-vars': 'warn',
          'no-undef': 'off',
          eqeqeq: 'warn',
          'no-eval': 'error',
          'no-console': 'warn',
          'no-debugger': 'error',
          'no-var': 'warn',
          'no-empty': 'warn',
          'no-dupe-keys': 'error',
          'no-constant-condition': 'warn',
          'no-fallthrough': 'warn',
        },
      },
    });

    const results = await eslint.lintFiles(files);
    const issues: RawLintIssue[] = [];

    for (const result of results) {
      const relFile = path.relative(repoDir, result.filePath);
      const sourceLines = this.safeReadLines(result.filePath);

      for (const msg of result.messages) {
        if (!msg.ruleId) continue; // skip raw parse errors for a cleaner demo
        // Repos' own eslint-disable comments reference rules we don't load; not real findings.
        if (/Definition for rule .* was not found/.test(msg.message)) continue;
        const line = msg.line || 1;
        const snippet = this.extractSnippet(sourceLines, line);
        issues.push({
          filePath: relFile,
          line,
          column: msg.column || 1,
          ruleId: msg.ruleId,
          message: msg.message,
          codeSnippet: snippet,
        });
      }
    }

    return issues;
  }

  private collectSourceFiles(dir: string, acc: string[] = []): string[] {
    const ignoreDirs = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage']);
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return acc;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.eslintrc') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (ignoreDirs.has(entry.name)) continue;
        this.collectSourceFiles(full, acc);
      } else if (/\.(js|jsx|ts|tsx|mjs|cjs)$/.test(entry.name)) {
        acc.push(full);
      }
    }
    // Cap for a demo-sized scan so this stays fast and the LLM call count stays sane
    return acc.slice(0, 150);
  }

  private safeReadLines(filePath: string): string[] {
    try {
      return fs.readFileSync(filePath, 'utf-8').split('\n');
    } catch {
      return [];
    }
  }

  private extractSnippet(lines: string[], line: number, context = 2): string {
    const start = Math.max(0, line - 1 - context);
    const end = Math.min(lines.length, line + context);
    return lines.slice(start, end).join('\n');
  }
}
