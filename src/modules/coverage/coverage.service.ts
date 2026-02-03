import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const BIN_SIZE = 0.001;

type CoverageQueryParams = {
  deviceId?: string;
  sessionId?: string;
  day: Date;
  bbox?: {
    minLon: number;
    minLat: number;
    maxLon: number;
    maxLat: number;
  };
  gatewayId?: string;
};

@Injectable()
export class CoverageService {
  constructor(private readonly prisma: PrismaService) {}

  async listBins(params: CoverageQueryParams) {
    const where: Record<string, unknown> = {
      day: params.day
    };

    if (params.deviceId) {
      where.deviceId = params.deviceId;
    }
    if (params.sessionId) {
      where.sessionId = params.sessionId;
    }
    if (params.gatewayId) {
      where.gatewayId = params.gatewayId;
    }

    if (params.bbox) {
      const latBinMin = Math.floor(params.bbox.minLat / BIN_SIZE);
      const latBinMax = Math.floor(params.bbox.maxLat / BIN_SIZE);
      const lonBinMin = Math.floor(params.bbox.minLon / BIN_SIZE);
      const lonBinMax = Math.floor(params.bbox.maxLon / BIN_SIZE);
      where.latBin = { gte: latBinMin, lte: latBinMax };
      where.lonBin = { gte: lonBinMin, lte: lonBinMax };
    }

    return this.prisma.coverageBin.findMany({
      where,
      select: {
        latBin: true,
        lonBin: true,
        count: true,
        rssiAvg: true,
        snrAvg: true,
        rssiMin: true,
        rssiMax: true,
        snrMin: true,
        snrMax: true
      }
    });
  }
}
