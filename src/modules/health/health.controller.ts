import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  getHealth(): { status: string } {
    return { status: 'ok' };
  }

  @Get('healthz')
  getHealthz(): { status: string } {
    return { status: 'ok' };
  }

  @Get('readyz')
  async getReadyz(
    @Res({ passthrough: true }) res: { status: (code: number) => unknown }
  ): Promise<{ status: 'ready' } | { status: 'not_ready'; error: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ready' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Database unreachable';
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { status: 'not_ready', error: errorMessage };
    }
  }
}
