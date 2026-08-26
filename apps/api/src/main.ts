import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'pg';
import { AppModule } from './app.module';

/** Runs ahead of Nest/TypeORM bootstrap, on a raw connection, using the same DB_* env
 * vars docker-compose already injects as real environment variables (no dotenv needed
 * here). `synchronize: true` has no migration history, so a column type change it can't
 * express as a plain ALTER TYPE gets "fixed" by dropping and recreating the column —
 * which either fails outright (NOT NULL with no default on a non-empty table) or, worse,
 * silently replaces every existing value with the default. Pre-applying the real ALTER
 * here keeps the column already matching the entity by the time synchronize inspects it,
 * so it has nothing destructive left to do. Safe to run every boot: the guard only fires
 * once, the first time it finds the column still in its old shape.
 */
async function runPreBootstrapMigrations() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  await client.connect();
  try {
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'player_ratings' AND column_name = 'rating' AND data_type = 'integer'
        ) THEN
          ALTER TABLE player_ratings ALTER COLUMN rating TYPE real USING rating::real;
        END IF;
      END $$;
    `);
  } finally {
    await client.end();
  }
}

async function bootstrap() {
  await runPreBootstrapMigrations();
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.enableCors({
    origin: configService.get<string>('WEB_APP_URL', 'http://localhost:5173'),
    credentials: true,
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(configService.get<number>('PORT', 3001));
}
bootstrap();
