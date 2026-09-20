import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { Repository } from 'typeorm';
import { AppModule } from '../app.module';
import {
  PlayerSubPosition,
  PreferredFoot,
  SeniorityTier,
  User,
  UserRole,
  UserStatus,
} from '../users/entities/user.entity';

// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv').config({ quiet: true });

process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-not-used-anywhere-else-1234567890';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-not-used-anywhere-else-1234567890';
process.env.FFF_SYNC_API_KEY ??= 'test-sync-api-key';
process.env.DB_HOST ??= 'localhost';
process.env.DB_PORT ??= '5432';
process.env.DB_USER ??= 'ronchin';
process.env.DB_PASSWORD ??= 'ronchin';

export interface TestUser {
  user: User;
  token: string;
}

export interface TestApp {
  app: INestApplication;
  /** supertest agent bound to the app. */
  http: () => ReturnType<typeof request>;
  get: <T>(token: unknown) => T;
  repo: <T extends object>(entity: new () => T) => Repository<T>;
  createUser: (over?: Partial<User>) => Promise<TestUser>;
  close: () => Promise<void>;
}

function adminClient(database: string): Client {
  return new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database,
  });
}

/** Boots the whole AppModule against its OWN throwaway Postgres database (created here,
 * dropped in close()), so specs can run in parallel workers without touching each other or
 * the dev/prod data. Same global prefix + ValidationPipe as main.ts, so requests behave
 * exactly like the real API. */
export async function createTestApp(
  overrides: { provide: unknown; useValue: unknown }[] = [],
): Promise<TestApp> {
  const baseDb = process.env.DB_NAME ?? 'ronchin_us_app';
  const testDb = `ronchin_test_${process.pid}_${randomBytes(4).toString('hex')}`;

  const admin = adminClient(baseDb);
  await admin.connect();
  await admin.query(`CREATE DATABASE "${testDb}"`);
  await admin.end();
  process.env.DB_NAME = testDb;

  let builder = Test.createTestingModule({ imports: [AppModule] });
  for (const o of overrides) builder = builder.overrideProvider(o.provide as never).useValue(o.useValue);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();

  const jwt = moduleRef.get(JwtService);
  const users = moduleRef.get<Repository<User>>(getRepositoryToken(User));
  let counter = 0;

  return {
    app,
    http: () => request(app.getHttpServer()),
    get: <T>(token: unknown) => moduleRef.get<T>(token as never),
    repo: <T extends object>(entity: new () => T) =>
      moduleRef.get<Repository<T>>(getRepositoryToken(entity)),
    createUser: async (over = {}) => {
      counter++;
      const user = await users.save(
        users.create({
          email: `user${counter}-${randomBytes(3).toString('hex')}@test.local`,
          passwordHash: await bcrypt.hash('Password-123', 4),
          role: UserRole.PLAYER,
          status: UserStatus.ACTIVE,
          firstName: `First${counter}`,
          lastName: `Last${counter}`,
          preferredFoot: PreferredFoot.RIGHT,
          birthDate: '1995-05-05',
          seniorityTier: SeniorityTier.ONE_TO_THREE,
          hasSeenOnboarding: true,
          positions: [PlayerSubPosition.CENTER_MIDFIELDER],
          ...over,
        }),
      );
      const token = jwt.sign(
        { sub: user.id, email: user.email, role: user.role },
        { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '1h' },
      );
      return { user, token };
    },
    close: async () => {
      await app.close();
      const cleanup = adminClient(baseDb);
      await cleanup.connect();
      await cleanup.query(`DROP DATABASE IF EXISTS "${testDb}" WITH (FORCE)`);
      await cleanup.end();
      process.env.DB_NAME = baseDb;
    },
  };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
