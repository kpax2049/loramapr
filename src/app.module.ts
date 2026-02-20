import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';
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
import { RetentionModule } from './modules/retention/retention.module';
import { StatusModule } from './modules/status/status.module';
import { EventsModule } from './modules/events/events.module';
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
    EventsModule,
    ReceiversModule,
    StatusModule,
    PrismaModule,
    RetentionModule
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter
    }
  ]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(requestIdMiddleware).forRoutes('*');
  }
}
