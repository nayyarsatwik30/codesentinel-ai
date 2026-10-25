import { Injectable, Logger } from '@nestjs/common';
import { RawLintIssue } from './eslint-runner.service';

export interface ExplainedIssue extends RawLintIssue {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  explanation: string;
  suggestedFix: string;
}

/**
 * LLM reasoning layer. Receives issues ALREADY flagged by deterministic
 * static analysis (EslintRunnerService) and only explains / prioritizes /
 * suggests a fix for each one. It never adds new issues of its own.
 *
 * Falls back to a rule-based mock explainer when no ANTHROPIC_API_KEY is
 * configured, so the pipeline is still demo-able without a live key.
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly apiKey = process.env.ANTHROPIC_API_KEY;
  private readonly model = process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-20241022';

  async explainAll(issues: RawLintIssue[]): Promise<ExplainedIssue[]> {
    const out: ExplainedIssue[] = [];
    for (const issue of issues) {
      try {
        out.push(await this.explainOne(issue));
      } catch (err) {
        this.logger.warn(`LLM explanation failed for ${issue.filePath}:${issue.line} — ${err}`);
        out.push({ ...issue, ...this.mockExplain(issue) });
      }
    }
    return out;
  }

  private async explainOne(issue: RawLintIssue): Promise<ExplainedIssue> {
    if (!this.apiKey) {
      return { ...issue, ...this.mockExplain(issue) };
    }

    const prompt = this.buildPrompt(issue);
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        model: this.model,
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic API ${res.status}`);
    }

    const data: any = await res.json();
    const text = data?.content?.[0]?.text ?? '';
    const parsed = this.parseModelJson(text);
    if (!parsed) {
      return { ...issue, ...this.mockExplain(issue) };
    }
    return { ...issue, ...parsed };
  }

  private buildPrompt(issue: RawLintIssue): string {
    return [
      'You are a senior code reviewer. A static analyzer flagged this issue.',
      'Respond with ONLY a JSON object, no prose, no markdown fences:',
      '{"severity":"CRITICAL|HIGH|MEDIUM|LOW|INFO","explanation":"<=2 sentences, plain language, for a junior developer","suggestedFix":"<=2 sentences, concrete fix"}',
      '',
      `Rule: ${issue.ruleId}`,
      `Lint message: ${issue.message}`,
      `File: ${issue.filePath}:${issue.line}`,
      'Code:',
      issue.codeSnippet,
    ].join('\n');
  }

  private parseModelJson(text: string): Pick<ExplainedIssue, 'severity' | 'explanation' | 'suggestedFix'> | null {
    try {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return null;
      const obj = JSON.parse(match[0]);
      if (!obj.severity || !obj.explanation || !obj.suggestedFix) return null;
      return obj;
    } catch {
      return null;
    }
  }

  /** Deterministic fallback so the demo works with zero API key configured. */
  private mockExplain(issue: RawLintIssue): Pick<ExplainedIssue, 'severity' | 'explanation' | 'suggestedFix'> {
    const severityByRule: Record<string, ExplainedIssue['severity']> = {
      'no-eval': 'CRITICAL',
      'no-debugger': 'HIGH',
      'no-dupe-keys': 'HIGH',
      eqeqeq: 'MEDIUM',
      'no-console': 'LOW',
      'no-var': 'LOW',
      'no-empty': 'LOW',
      '@typescript-eslint/no-unused-vars': 'INFO',
      'no-constant-condition': 'MEDIUM',
      'no-fallthrough': 'MEDIUM',
    };
    return {
      severity: severityByRule[issue.ruleId] || 'MEDIUM',
      explanation: `Static analysis rule "${issue.ruleId}" was triggered: ${issue.message}. (Mock explanation — set ANTHROPIC_API_KEY for LLM-generated explanations.)`,
      suggestedFix: `Review the flagged line against the "${issue.ruleId}" rule documentation and adjust the code accordingly.`,
    };
  }
}
