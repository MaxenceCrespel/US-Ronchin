import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MatchesService } from './matches.service';
import { Match, MatchStatus } from './entities/match.entity';
import { MatchComposition } from './entities/match-composition.entity';
import { MatchEvent } from './entities/match-event.entity';
import { PlayerRating } from './entities/player-rating.entity';
import { MatchRatingSubmission } from './entities/match-rating-submission.entity';
import { MatchAttendance } from './entities/match-attendance.entity';
import { MatchAttendanceGuest } from './entities/match-attendance-guest.entity';
import { MatchMotmVote } from './entities/match-motm-vote.entity';
import { MatchDefenseBossVote } from './entities/match-defense-boss-vote.entity';
import { AttendanceStatus } from '../attendances/entities/attendance.entity';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';

type Att = { userId: string; status: AttendanceStatus; called: boolean };

const att = (
  userId: string,
  status: AttendanceStatus,
  called = false,
): Att => ({
  userId,
  status,
  called,
});

/** Builds the service over in-memory fakes: only the calls setConvocation/setLineup make. */
async function build(opts: {
  match?: Partial<Match>;
  attendances: Att[];
  lineup?: { formation: string | null; slots: string[] | null };
}) {
  const match = {
    id: 'm1',
    opponent: 'FC Test',
    status: MatchStatus.SCHEDULED,
    convocationAnnouncedAt: null,
    ...opts.match,
  } as Match;
  const matchesRepo = {
    findOne: jest.fn(({ select }: { select?: object }) =>
      Promise.resolve(
        select
          ? {
              ...match,
              lineupFormation: opts.lineup?.formation ?? null,
              lineupSlots: opts.lineup?.slots ?? null,
              lineupValidatedAt: null,
            }
          : match,
      ),
    ),
    save: jest.fn((m: Match) => Promise.resolve(m)),
  };
  const attendancesRepo = {
    find: jest.fn(({ where }: { where: { called?: boolean } }) =>
      Promise.resolve(
        where.called === undefined
          ? opts.attendances
          : opts.attendances.filter((a) => a.called === where.called),
      ),
    ),
    save: jest.fn((a: Att) => Promise.resolve(a)),
  };
  const push = { sendToUsers: jest.fn().mockResolvedValue(undefined) };
  const stub = {};
  const moduleRef = await Test.createTestingModule({
    providers: [
      MatchesService,
      { provide: getRepositoryToken(Match), useValue: matchesRepo },
      {
        provide: getRepositoryToken(MatchAttendance),
        useValue: attendancesRepo,
      },
      { provide: getRepositoryToken(MatchComposition), useValue: stub },
      { provide: getRepositoryToken(MatchEvent), useValue: stub },
      { provide: getRepositoryToken(PlayerRating), useValue: stub },
      { provide: getRepositoryToken(MatchRatingSubmission), useValue: stub },
      { provide: getRepositoryToken(MatchAttendanceGuest), useValue: stub },
      { provide: getRepositoryToken(MatchMotmVote), useValue: stub },
      { provide: getRepositoryToken(MatchDefenseBossVote), useValue: stub },
      { provide: PushNotificationsService, useValue: push },
    ],
  }).compile();
  return {
    service: moduleRef.get(MatchesService),
    match,
    matchesRepo,
    attendancesRepo,
    push,
  };
}

/** Which user ids received a push with the given title. */
const recipients = (
  push: { sendToUsers: jest.Mock },
  title: string,
): string[] =>
  push.sendToUsers.mock.calls
    .filter(
      ([, payload]: [string[], { title: string }]) => payload.title === title,
    )
    .flatMap(([ids]: [string[]]) => ids);

describe('MatchesService.setConvocation', () => {
  it('first announcement: tells the called and the not-retained present players', async () => {
    const { service, push, match } = await build({
      attendances: [
        att('a', AttendanceStatus.PRESENT),
        att('b', AttendanceStatus.PRESENT),
        att('c', AttendanceStatus.PRESENT),
        att('d', AttendanceStatus.ABSENT),
      ],
    });

    await service.setConvocation('m1', { calledUserIds: ['a', 'b'] });

    expect(recipients(push, 'Tu es convoqué !').sort()).toEqual(['a', 'b']);
    expect(recipients(push, 'Convocation')).toEqual(['c']);
    expect(recipients(push, 'Convocation annulée')).toEqual([]);
    expect(match.convocationAnnouncedAt).toBeInstanceOf(Date);
  });

  it('update: only notifies players whose status changes', async () => {
    const { service, push } = await build({
      match: { convocationAnnouncedAt: new Date() },
      attendances: [
        att('a', AttendanceStatus.PRESENT, true),
        att('b', AttendanceStatus.PRESENT, true),
        att('c', AttendanceStatus.PRESENT, false),
      ],
    });

    // b withdrawn, c added, a untouched
    await service.setConvocation('m1', { calledUserIds: ['a', 'c'] });

    expect(recipients(push, 'Tu es convoqué !')).toEqual(['c']);
    expect(recipients(push, 'Convocation annulée')).toEqual(['b']);
    expect(recipients(push, 'Convocation')).toEqual([]);
  });

  it("doesn't tell a withdrawn player who has since become absent", async () => {
    const { service, push } = await build({
      match: { convocationAnnouncedAt: new Date() },
      attendances: [
        att('a', AttendanceStatus.PRESENT, true),
        att('b', AttendanceStatus.ABSENT, true),
      ],
    });

    await service.setConvocation('m1', { calledUserIds: ['a'] });

    expect(recipients(push, 'Convocation annulée')).toEqual([]);
  });

  it('persists the called flag on the attendances that changed only', async () => {
    const { service, attendancesRepo } = await build({
      match: { convocationAnnouncedAt: new Date() },
      attendances: [
        att('a', AttendanceStatus.PRESENT, true),
        att('b', AttendanceStatus.PRESENT, false),
      ],
    });

    await service.setConvocation('m1', { calledUserIds: ['a', 'b'] });

    expect(attendancesRepo.save).toHaveBeenCalledTimes(1);
    expect(attendancesRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'b', called: true }),
    );
  });

  it('rejects calling a player who is not present', async () => {
    const { service } = await build({
      attendances: [
        att('a', AttendanceStatus.PRESENT),
        att('b', AttendanceStatus.MAYBE),
      ],
    });

    await expect(
      service.setConvocation('m1', { calledUserIds: ['b'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a change once the match is played', async () => {
    const { service } = await build({
      match: { status: MatchStatus.PLAYED },
      attendances: [att('a', AttendanceStatus.PRESENT)],
    });

    await expect(
      service.setConvocation('m1', { calledUserIds: ['a'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('withdrawing a starter drops him from the saved lineup and invalidates it', async () => {
    const { service, matchesRepo } = await build({
      match: { convocationAnnouncedAt: new Date() },
      attendances: [
        att('a', AttendanceStatus.PRESENT, true),
        att('b', AttendanceStatus.PRESENT, true),
      ],
      lineup: { formation: '4-4-2 à plat', slots: ['a', 'b'] },
    });

    await service.setConvocation('m1', { calledUserIds: ['a'] });

    expect(matchesRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ lineupSlots: ['a'], lineupValidatedAt: null }),
    );
  });
});

describe('MatchesService.setLineup', () => {
  it('requires the convocation to be announced first', async () => {
    const { service } = await build({ attendances: [] });
    await expect(
      service.setLineup('m1', { formation: '4-3-3', slots: [] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('only accepts called players as starters', async () => {
    const { service } = await build({
      match: { convocationAnnouncedAt: new Date() },
      attendances: [
        att('a', AttendanceStatus.PRESENT, true),
        att('b', AttendanceStatus.PRESENT, false),
      ],
    });
    await expect(
      service.setLineup('m1', { formation: '4-3-3', slots: ['a', 'b'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses more than 11 starters', async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `p${i}`);
    const { service } = await build({
      match: { convocationAnnouncedAt: new Date() },
      attendances: ids.map((id) => att(id, AttendanceStatus.PRESENT, true)),
    });
    await expect(
      service.setLineup('m1', { formation: '4-3-3', slots: ids }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('saves and validates a legitimate lineup', async () => {
    const { service, match } = await build({
      match: { convocationAnnouncedAt: new Date() },
      attendances: [
        att('a', AttendanceStatus.PRESENT, true),
        att('b', AttendanceStatus.PRESENT, true),
      ],
    });
    await service.setLineup('m1', {
      formation: '4-3-3',
      slots: ['a', 'b'],
      validate: true,
    });
    expect(match.lineupSlots).toEqual(['a', 'b']);
    expect(match.lineupFormation).toBe('4-3-3');
    expect(match.lineupValidatedAt).toBeInstanceOf(Date);
  });
});
