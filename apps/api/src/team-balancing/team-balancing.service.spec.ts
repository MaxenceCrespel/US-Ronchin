import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TeamBalancingService } from './team-balancing.service';
import { TrainingTeamAssignment } from './entities/training-team-assignment.entity';
import { PlayerSeparationRule } from '../users/entities/player-separation-rule.entity';
import { TrainingSession } from '../trainings/entities/training-session.entity';
import {
  Attendance,
  AttendanceStatus,
} from '../attendances/entities/attendance.entity';
import { AttendanceGuest } from '../attendances/entities/attendance-guest.entity';
import { StatsService } from '../stats/stats.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';

type A = {
  id: string;
  userId: string | null;
  teamIndex: number;
  attendanceGuestId?: string | null;
};

async function build(opts: {
  assignments: A[];
  attendances?: Record<string, Record<string, unknown>>;
  guest?: unknown;
}) {
  const assignments = [...opts.assignments];
  const attendances = { ...(opts.attendances ?? {}) };
  const assignmentsRepo = {
    find: jest.fn(() => Promise.resolve(assignments)),
    findOne: jest.fn(({ where }: { where: { id: string } }) =>
      Promise.resolve(assignments.find((a) => a.id === where.id) ?? null),
    ),
    delete: jest.fn((id: string) => {
      const i = assignments.findIndex((a) => a.id === id);
      if (i >= 0) assignments.splice(i, 1);
      return Promise.resolve();
    }),
    create: jest.fn((a: Partial<A>) => ({
      id: `new-${assignments.length}`,
      ...a,
    })),
    save: jest.fn((a: A) => {
      assignments.push(a);
      return Promise.resolve(a);
    }),
  };
  const attendancesRepo = {
    update: jest.fn(
      ({ userId }: { userId: string }, patch: Record<string, unknown>) => {
        attendances[userId] = { ...(attendances[userId] ?? {}), ...patch };
        return Promise.resolve();
      },
    ),
    findOne: jest.fn(({ where }: { where: { userId: string } }) =>
      Promise.resolve(attendances[where.userId] ?? null),
    ),
    create: jest.fn((a: Record<string, unknown>) => a),
    save: jest.fn((a: Record<string, unknown> & { userId: string }) => {
      attendances[a.userId] = a;
      return Promise.resolve(a);
    }),
    decrement: jest.fn().mockResolvedValue(undefined),
  };
  const guestsRepo = {
    findOne: jest.fn().mockResolvedValue(opts.guest ?? null),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const moduleRef = await Test.createTestingModule({
    providers: [
      TeamBalancingService,
      {
        provide: getRepositoryToken(TrainingTeamAssignment),
        useValue: assignmentsRepo,
      },
      {
        provide: getRepositoryToken(TrainingSession),
        useValue: { findOne: jest.fn().mockResolvedValue({ id: 's1' }) },
      },
      { provide: getRepositoryToken(Attendance), useValue: attendancesRepo },
      { provide: getRepositoryToken(AttendanceGuest), useValue: guestsRepo },
      { provide: getRepositoryToken(PlayerSeparationRule), useValue: {} },
      { provide: StatsService, useValue: {} },
      { provide: PushNotificationsService, useValue: {} },
    ],
  }).compile();
  return {
    service: moduleRef.get(TeamBalancingService),
    assignments,
    attendances,
    attendancesRepo,
    guestsRepo,
  };
}

describe('TeamBalancingService.removeFromTeam', () => {
  it('marks a real player absent on the pointage, leaving his declared status alone', async () => {
    const { service, attendancesRepo, assignments } = await build({
      assignments: [{ id: 'x1', userId: 'u1', teamIndex: 0 }],
    });
    await service.removeFromTeam('s1', 'x1');
    expect(assignments).toHaveLength(0);
    expect(attendancesRepo.update).toHaveBeenCalledWith(
      { trainingSessionId: 's1', userId: 'u1' },
      { actualStatus: AttendanceStatus.ABSENT },
    );
    // "beau parleur" relies on the declared status staying PRESENT
    const patch = attendancesRepo.update.mock.calls[0][1];
    expect(patch).not.toHaveProperty('status');
  });

  it('deletes a removed guest and releases his slot', async () => {
    const { service, guestsRepo, attendancesRepo } = await build({
      assignments: [
        { id: 'x2', userId: null, teamIndex: 1, attendanceGuestId: 'g1' },
      ],
      guest: { id: 'g1', attendanceId: 'att1' },
    });
    await service.removeFromTeam('s1', 'x2');
    expect(guestsRepo.delete).toHaveBeenCalledWith('g1');
    expect(attendancesRepo.decrement).toHaveBeenCalledWith(
      { id: 'att1' },
      'guestCount',
      1,
    );
    expect(attendancesRepo.decrement).toHaveBeenCalledWith(
      { id: 'att1' },
      'confirmedGuestCount',
      1,
    );
  });

  it('404s on an unknown assignment', async () => {
    const { service } = await build({ assignments: [] });
    await expect(service.removeFromTeam('s1', 'nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('TeamBalancingService.addPlayerToTeam', () => {
  it('requires teams to exist already', async () => {
    const { service } = await build({ assignments: [] });
    await expect(service.addPlayerToTeam('s1', 'u9')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses a player who is already on a team', async () => {
    const { service } = await build({
      assignments: [{ id: 'x1', userId: 'u1', teamIndex: 0 }],
    });
    await expect(service.addPlayerToTeam('s1', 'u1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('marks a non-respondent PRESENT and puts him on the smallest team', async () => {
    const { service, assignments, attendances } = await build({
      assignments: [
        { id: 'x1', userId: 'a', teamIndex: 0 },
        { id: 'x2', userId: 'b', teamIndex: 0 },
        { id: 'x3', userId: 'c', teamIndex: 1 },
      ],
    });
    await service.addPlayerToTeam('s1', 'newbie');
    expect(attendances['newbie']).toMatchObject({
      status: AttendanceStatus.PRESENT,
    });
    expect(attendances['newbie'].respondedAt).toBeInstanceOf(Date);
    expect(assignments.find((a) => a.userId === 'newbie')?.teamIndex).toBe(1);
  });

  it('overrides an ABSENT declaration when the coach places the player', async () => {
    const { service, attendances } = await build({
      assignments: [{ id: 'x1', userId: 'a', teamIndex: 0 }],
      attendances: {
        late: { userId: 'late', status: AttendanceStatus.ABSENT },
      },
    });
    await service.addPlayerToTeam('s1', 'late');
    expect(attendances['late'].status).toBe(AttendanceStatus.PRESENT);
  });
});
