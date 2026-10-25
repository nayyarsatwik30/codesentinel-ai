import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { CreateScanDto } from './dto/create-scan.dto';
import { ScanService } from './scan.service';

@Controller('scan')
export class ScanController {
  constructor(private readonly scanService: ScanService) {}

  @Post()
  async create(@Body() dto: CreateScanDto) {
    const scan = await this.scanService.createScan(dto.repoUrl);
    return { id: scan.id, status: scan.status };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const scan = await this.scanService.getScan(id);
    if (!scan) throw new NotFoundException('Scan not found');
    return scan;
  }
}
