import { getRepositoryToken } from '@nestjs/typeorm';
import { SessionLockService } from '../trainings/session-lock.service';

/** Test double for SessionLockService: runs the work straight away, with a manager that hands
 * back the same mocked repositories the testing module already provides for `entities` — so
 * the transaction-bound copy a service makes of itself sees exactly the same fake data. */
export function sessionLockProvider(entities: unknown[]) {
  return {
    provide: SessionLockService,
    useFactory: (...repos: unknown[]) => {
      const byEntity = new Map(entities.map((entity, i) => [entity, repos[i]]));
      const manager = { getRepository: (entity: unknown) => byEntity.get(entity) };
      return { run: (_sessionId: string, work: (m: unknown) => Promise<unknown>) => work(manager) };
    },
    inject: entities.map((entity) => getRepositoryToken(entity as never)),
  };
}

/** Same double for specs that build a service by hand instead of through a testing module. */
export function manualSessionLock(pairs: [unknown, unknown][]) {
  const byEntity = new Map(pairs);
  const manager = { getRepository: (entity: unknown) => byEntity.get(entity) };
  return { run: (_sessionId: string, work: (m: unknown) => Promise<unknown>) => work(manager) };
}
