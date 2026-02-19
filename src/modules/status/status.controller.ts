import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiKeyScope } from '@prisma/client';
import { RequireApiKeyScope } from '../../common/decorators/api-key-scopes.decorator';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { StatusResponse, StatusService } from './status.service';

@Controller('api/status')
export class StatusController {
  constructor(private readonly statusService: StatusService) {}

  @Get()
  @UseGuards(ApiKeyGuard)
  @RequireApiKeyScope(ApiKeyScope.QUERY)
  async getStatus(): Promise<StatusResponse> {
    return this.statusService.getStatus();
  }
}
