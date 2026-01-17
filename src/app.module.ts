import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validationSchema } from './config/validation';
import { HealthModule } from './modules/health/health.module';
import { MeasurementsModule } from './modules/measurements/measurements.module';
import { TracksModule } from './modules/tracks/tracks.module';
import { DevicesModule } from './modules/devices/devices.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema
    }),
    HealthModule,
    DevicesModule,
    MeasurementsModule,
    TracksModule,
    PrismaModule
  ]
})
export class AppModule {}
