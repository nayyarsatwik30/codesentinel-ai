import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { EslintRunnerService } from './eslint-runner.service';
import { LlmService } from './llm.service';
import { ScanController } from './scan.controller';
import { ScanService } from './scan.service';

@Module({
  controllers: [ScanController],
  providers: [ScanService, PrismaService, EslintRunnerService, LlmService],
})
export class ScanModule {}
