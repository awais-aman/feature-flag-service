import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Routes Nest's own bootstrap/lifecycle logs through the same structured
  // JSON pino writer as request logs, instead of Nest's default console logger.
  app.useLogger(app.get(Logger));

  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Cloud Run sends SIGTERM before removing traffic from a revision during a
  // blue-green cutover or scale-down; this lets in-flight requests finish
  // (Prisma/Redis connections close cleanly) instead of dropping them.
  app.enableShutdownHooks();

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port, '0.0.0.0');
}

bootstrap();
