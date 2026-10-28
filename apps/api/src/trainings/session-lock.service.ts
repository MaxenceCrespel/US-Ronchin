import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { TrainingSession } from './entities/training-session.entity';

/** Runs everything that reads-then-writes one training session's attendance or teams as a
 * single transaction holding a row lock on that session. Two requests for the same session
 * therefore queue up instead of interleaving: each used to read "17 of 18 places taken"
 * before either had written, so both were confirmed and the cap was blown. Requests for other
 * sessions aren't affected — the lock is on this one row. Everything inside `work` has to go
 * through the given manager, or it escapes the transaction. */
@Injectable()
export class SessionLockService {
  constructor(private readonly dataSource: DataSource) {}

  run<T>(sessionId: string, work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      await manager
        .createQueryBuilder(TrainingSession, 'session')
        .setLock('pessimistic_write')
        .where('session.id = :sessionId', { sessionId })
        .getOne();
      return work(manager);
    });
  }
}
