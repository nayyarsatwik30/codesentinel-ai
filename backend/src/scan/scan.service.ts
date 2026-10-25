import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import simpleGit from 'simple-git';
import { PrismaService } from '../prisma.service';
import { EslintRunnerService } from './eslint-runner.service';
import { LlmService } from './llm.service';

const PIPELINE_TIMEOUT_MS = 60_000;

@Injectable()
export class ScanService {
  private readonly logger = new Logger(ScanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eslintRunner: EslintRunnerService,
    private readonly llm: LlmService,
  ) {}

  async createScan(repoUrl: string) {
    const scan = await this.prisma.scan.create({
      data: { repoUrl, status: 'PENDING' },
    });

    // Run the pipeline in the background; the client polls GET /scan/:id.
    this.runPipeline(scan.id, repoUrl).catch((err) => {
      this.logger.error(`Pipeline failed for scan ${scan.id}: ${err}`);
    });

    return scan;
  }

  async getScan(id: string) {
    return this.prisma.scan.findUnique({
      where: { id },
      include: { issues: true },
    });
  }

  private withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    });
    return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
  }

  private async runPipeline(scanId: string, repoUrl: string) {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codesentinel-'));
    try {
      await this.withTimeout(this.runStages(scanId, repoUrl, workDir), PIPELINE_TIMEOUT_MS, 'Scan pipeline');
    } catch (err: any) {
      this.logger.error(`[${scanId}] FAILED: ${err?.message || err}`);
      await this.prisma.scan
        .update({
          where: { id: scanId },
          data: { status: 'FAILED', error: String(err?.message || err) },
        })
        .catch((e) => this.logger.error(`[${scanId}] could not mark scan FAILED: ${e}`));
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  }

  private async runStages(scanId: string, repoUrl: string, workDir: string) {
    this.logger.log(`[${scanId}] CLONING start`);
    await this.prisma.scan.update({ where: { id: scanId }, data: { status: 'CLONING' } });
    await simpleGit().clone(repoUrl, workDir, ['--depth', '1']);
    this.logger.log(`[${scanId}] CLONING done`);

    this.logger.log(`[${scanId}] ANALYZING start`);
    await this.prisma.scan.update({ where: { id: scanId }, data: { status: 'ANALYZING' } });
    const rawIssues = await this.eslintRunner.run(workDir);
    this.logger.log(`[${scanId}] ANALYZING done (${rawIssues.length} issues)`);

    this.logger.log(`[${scanId}] EXPLAINING start`);
    await this.prisma.scan.update({ where: { id: scanId }, data: { status: 'EXPLAINING' } });
    const explained = await this.llm.explainAll(rawIssues);
    this.logger.log(`[${scanId}] EXPLAINING done (${explained.length} issues)`);

    if (explained.length > 0) {
      this.logger.log(`[${scanId}] issue.createMany start`);
      await this.withTimeout(
        this.prisma.issue.createMany({
          data: explained.map((issue) => ({
            scanId,
            filePath: issue.filePath,
            line: issue.line,
            column: issue.column,
            ruleId: issue.ruleId,
            message: issue.message,
            codeSnippet: issue.codeSnippet,
            severity: issue.severity,
            explanation: issue.explanation,
            suggestedFix: issue.suggestedFix,
          })),
        }),
        PIPELINE_TIMEOUT_MS,
        'issue.createMany',
      );
      this.logger.log(`[${scanId}] issue.createMany done`);
    }

    await this.prisma.scan.update({ where: { id: scanId }, data: { status: 'DONE' } });
    this.logger.log(`[${scanId}] DONE`);
  }
}
