import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TeamBalancingService } from './team-balancing.service';
import { TrainingTeamAssignment } from './entities/training-team-assignment.entity';
import { PlayerSeparationRule } from '../users/entities/player-separation-rule.entity';
import { TrainingSession } from '../trainings/entities/training-session.entity';
import { Attendance } from '../attendances/entities/attendance.entity';
import { AttendanceGuest } from '../attendances/entities/attendance-guest.entity';
import { StatsService } from '../stats/stats.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { sessionLockProvider } from '../test-utils/session-lock-mock';
import { AttendancesService } from '../attendances/attendances.service';

type S = { id: string; date: string; startTime: string; scoreTeam0: number; scoreTeam1: number };
type A = { trainingSessionId: string; userId: string; teamIndex: number };

async function rankingFor(sessions: S[], assignments: A[]) {
  const withUsers = assignments.map((a) => ({
    ...a,
    user: { firstName: a.userId, lastName: '' },
  }));
  const moduleRef = await Test.createTestingModule({
    providers: [
      TeamBalancingService,
      {
        provide: getRepositoryToken(TrainingTeamAssignment),
        useValue: { find: jest.fn().mockResolvedValue(withUsers) },
      },
      {
        provide: getRepositoryToken(TrainingSession),
        useValue: {
          createQueryBuilder: () => ({
            where: () => ({ getMany: () => Promise.resolve(sessions) }),
          }),
        },
      },
      { provide: getRepositoryToken(Attendance), useValue: {} },
      { provide: getRepositoryToken(AttendanceGuest), useValue: {} },
      { provide: getRepositoryToken(PlayerSeparationRule), useValue: {} },
      { provide: StatsService, useValue: {} },
      sessionLockProvider([
        TrainingTeamAssignment,
        TrainingSession,
        Attendance,
        AttendanceGuest,
        PlayerSeparationRule,
      ]),
      { provide: AttendancesService, useValue: {} },
      { provide: PushNotificationsService, useValue: {} },
    ],
  }).compile();
  const ranking = await moduleRef.get(TeamBalancingService).getTrainingRanking();
  return Object.fromEntries(ranking.map((e) => [e.userId, e]));
}

describe('TeamBalancingService.getTrainingRanking rankChange', () => {
  // Listed latest-first on purpose: the "latest session" must come from the dates, not the order.
  const sessions: S[] = [
    { id: 's2', date: '2026-11-08', startTime: '19:00:00', scoreTeam0: 5, scoreTeam1: 0 },
    { id: 's1', date: '2026-11-01', startTime: '19:00:00', scoreTeam0: 1, scoreTeam1: 0 },
  ];
  const assignments: A[] = [
    { trainingSessionId: 's1', userId: 'a', teamIndex: 0 },
    { trainingSessionId: 's1', userId: 'b', teamIndex: 0 },
    { trainingSessionId: 's1', userId: 'c', teamIndex: 1 },
    { trainingSessionId: 's2', userId: 'c', teamIndex: 0 },
    { trainingSessionId: 's2', userId: 'a', teamIndex: 1 },
    { trainingSessionId: 's2', userId: 'd', teamIndex: 1 },
  ];

  it('compares each rank with the one before the latest scored session', async () => {
    // Before s2: a 4, b 4 (both 1st), c 0 (3rd). After: c 8 (1st), a 4, b 4 (2nd), d 0.
    const r = await rankingFor(sessions, assignments);
    expect(r.c.rankChange).toBe(2);
    expect(r.a.rankChange).toBe(-1);
    expect(r.b.rankChange).toBe(-1); // didn't play s2 but got overtaken
    expect(r.d.rankChange).toBeNull(); // wasn't ranked before s2
  });

  it('has no movement when only one session is scored', async () => {
    const r = await rankingFor(
      [sessions[1]],
      assignments.filter((a) => a.trainingSessionId === 's1'),
    );
    expect(Object.values(r).every((e) => e.rankChange === null)).toBe(true);
  });
});
