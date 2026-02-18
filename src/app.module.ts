import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/validation';
import { HealthModule } from './modules/health/health.module';
import { MeasurementsModule } from './modules/measurements/measurements.module';
import { TracksModule } from './modules/tracks/tracks.module';
import { DevicesModule } from './modules/devices/devices.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { LorawanModule } from './modules/lorawan/lorawan.module';
import { CoverageModule } from './modules/coverage/coverage.module';
import { ExportModule } from './modules/export/export.module';
import { GatewaysModule } from './modules/gateways/gateways.module';
import { MeshtasticModule } from './modules/meshtastic/meshtastic.module';
import { ReceiversModule } from './modules/receivers/receivers.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv
    }),
    HealthModule,
    DevicesModule,
    MeasurementsModule,
    TracksModule,
    SessionsModule,
    LorawanModule,
    CoverageModule,
    ExportModule,
    GatewaysModule,
    MeshtasticModule,
    ReceiversModule,
    PrismaModule
  ]
})
export class AppModule {}
