import { createTestApp, TestApp, TestUser } from './test-utils/test-app';
import { PushNotificationsScheduler } from './push-notifications/push-notifications.scheduler';
import { PushNotificationsService } from './push-notifications/push-notifications.service';
import { AwardsScheduler } from './awards/awards.scheduler';
import { MonthlyAwardScheduler } from './awards/monthly-award.scheduler';
import { BadgesScheduler } from './badges/badges.scheduler';
import { TrainingsScheduler } from './trainings/trainings.scheduler';
import { TeamBalancingScheduler } from './team-balancing/team-balancing.scheduler';
import { UserRole } from './users/entities/user.entity';
import { Match, MatchHomeAway, MatchStatus } from './matches/entities/match.entity';
import { MatchComposition } from './matches/entities/match-composition.entity';
import { MatchMotmVote } from './matches/entities/match-motm-vote.entity';
import { TrainingSession } from './trainings/entities/training-session.entity';
import { Training, TrainingType } from './trainings/entities/training.entity';
import { Attendance, AttendanceStatus } from './attendances/entities/attendance.entity';
import { TrainingTeamAssignment } from './team-balancing/entities/training-team-assignment.entity';
import { AwardCategory } from './awards/entities/award-category.entity';
import { User } from './users/entities/user.entity';
import { parisDateOnly } from './common/utils/paris-time';

const ONLY_DATE = ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'clearImmediate', 'queueMicrotask', 'performance', 'hrtime'] as never;
/** Freezes only `Date` so DB drivers/timers keep working while a cron handler "wakes up" at a chosen moment. */
const at = (iso: string) => jest.useFakeTimers({ now: new Date(iso), doNotFake: ONLY_DATE });

const ymd = (offset = 0, base = new Date()) => {
  const d = new Date(base);
  d.setDate(d.getDate() + offset);
  return parisDateOnly(d);
};

describe('schedulers (real stack)', () => {
  let t: TestApp;
  let coach: TestUser;
  let players: TestUser[];
  let push: { sendToUsers: jest.SpyInstance; sendToCoaches: jest.SpyInstance };

  beforeAll(async () => {
    t = await createTestApp();
    const svc = t.get<PushNotificationsService>(PushNotificationsService);
    push = {
      sendToUsers: jest.spyOn(svc, 'sendToUsers').mockResolvedValue(undefined),
      sendToCoaches: jest.spyOn(svc, 'sendToCoaches').mockResolvedValue(undefined),
    };
    coach = await t.createUser({ role: UserRole.COACH });
    players = [];
    for (let i = 0; i < 5; i++) players.push(await t.createUser());
  });
  afterAll(async () => {
    jest.useRealTimers();
    await t.close();
  });
  beforeEach(() => {
    push.sendToUsers.mockClear();
    push.sendToCoaches.mockClear();
  });
  afterEach(() => jest.useRealTimers());

  const titles = (spy: jest.SpyInstance) => spy.mock.calls.map((c) => (c[c.length - 1] as { title: string }).title);

  describe('push reminders', () => {
    it('reminds coaches once about a missing match result', async () => {
      const matches = t.repo(Match);
      const m = await matches.save(matches.create({ date: ymd(-3), opponent: 'Late FC', homeAway: MatchHomeAway.HOME, status: MatchStatus.SCHEDULED }));
      const s = t.get<PushNotificationsScheduler>(PushNotificationsScheduler);
      await s.handleMissingResultReminders();
      expect(titles(push.sendToCoaches)).toEqual(['Résultat manquant']);
      expect((await matches.findOneByOrFail({ id: m.id })).resultReminderSentAt).not.toBeNull();
      await s.handleMissingResultReminders();
      expect(push.sendToCoaches).toHaveBeenCalledTimes(1);
    });

    it('reminds coaches once about a missing pointage after the session ended', async () => {
      const sessions = t.repo(TrainingSession);
      const done = await sessions.save(sessions.create({ date: ymd(-1), startTime: '19:00', endTime: '20:30', location: 'x' }));
      const pointed = await sessions.save(sessions.create({ date: ymd(-1), startTime: '18:00', endTime: '19:00', location: 'x' }));
      await t.repo(Attendance).save(t.repo(Attendance).create({ trainingSessionId: pointed.id, userId: players[0].user.id, status: AttendanceStatus.PRESENT, actualStatus: AttendanceStatus.PRESENT, respondedAt: new Date() }));
      const s = t.get<PushNotificationsScheduler>(PushNotificationsScheduler);
      await s.handleMissingAttendanceReminders();
      // only the un-pointed session triggers a push, both are marked as handled
      expect(titles(push.sendToCoaches)).toEqual(['Pointage à faire']);
      expect((await sessions.findOneByOrFail({ id: done.id })).attendanceReminderSentAt).not.toBeNull();
      expect((await sessions.findOneByOrFail({ id: pointed.id })).attendanceReminderSentAt).not.toBeNull();
    });

    it('nudges non-respondents once, within 3h of a training', async () => {
      // pinned to 14:00 Paris so the test never straddles midnight, whenever CI happens to run
      at('2026-09-21T12:00:00Z');
      const sessions = t.repo(TrainingSession);
      const soon = await sessions.save(
        sessions.create({ date: '2026-09-21', startTime: '15:00', endTime: '16:30', location: 'x' }),
      );
      await t.repo(Attendance).save(t.repo(Attendance).create({ trainingSessionId: soon.id, userId: players[0].user.id, status: AttendanceStatus.PRESENT, respondedAt: new Date() }));
      const s = t.get<PushNotificationsScheduler>(PushNotificationsScheduler);
      await s.handleTrainingResponseReminders();
      const call = push.sendToUsers.mock.calls.find((c) => (c[1] as { title: string }).title === 'Présence à confirmer');
      expect(call).toBeDefined();
      const recipients = call![0] as string[];
      expect(recipients).not.toContain(players[0].user.id);
      expect(recipients).toContain(players[1].user.id);
      push.sendToUsers.mockClear();
      await s.handleTrainingResponseReminders(); // one-shot
      expect(push.sendToUsers).not.toHaveBeenCalled();
    });

    it("reminds the day before a match for those who haven't answered", async () => {
      const matches = t.repo(Match);
      await matches.save(matches.create({ date: ymd(1), opponent: 'Tomorrow FC', homeAway: MatchHomeAway.AWAY, status: MatchStatus.SCHEDULED }));
      const s = t.get<PushNotificationsScheduler>(PushNotificationsScheduler);
      await s.handleMatchResponseReminders();
      expect(titles(push.sendToUsers)).toContain('Présence à confirmer');
      push.sendToUsers.mockClear();
      await s.handleMatchResponseReminders();
      expect(push.sendToUsers).not.toHaveBeenCalled();
    });

    it('announces revealed votes once', async () => {
      const matches = t.repo(Match);
      const m = await matches.save(matches.create({ date: ymd(-4), opponent: 'Vote FC', homeAway: MatchHomeAway.HOME, status: MatchStatus.PLAYED }));
      const comps = t.repo(MatchComposition);
      for (const p of players.slice(0, 3)) await comps.save(comps.create({ matchId: m.id, userId: p.user.id, isStarter: true }));
      const votes = t.repo(MatchMotmVote);
      await votes.save(votes.create({ matchId: m.id, voterId: players[0].user.id, votedForId: players[1].user.id, createdAt: new Date(Date.now() - 30 * 3_600_000) }));
      const s = t.get<PushNotificationsScheduler>(PushNotificationsScheduler);
      await s.handleVoteRevealedNotifications();
      expect(titles(push.sendToUsers)).toContain('Homme du match révélé');
      expect(titles(push.sendToUsers)).not.toContain('Patron de la défense révélé');
      push.sendToUsers.mockClear();
      await s.handleVoteRevealedNotifications();
      expect(titles(push.sendToUsers)).not.toContain('Homme du match révélé');
    });

    it("wishes a happy birthday to the whole club, once a day", async () => {
      const today = parisDateOnly(new Date());
      const bday = await t.createUser({ birthDate: `1992-${today.slice(5)}`, firstName: 'Fêté' });
      const s = t.get<PushNotificationsScheduler>(PushNotificationsScheduler);
      await s.handleBirthdayReminders();
      const call = push.sendToUsers.mock.calls.find((c) => (c[1] as { title: string }).title.includes('anniversaire'));
      expect(call).toBeDefined();
      expect(call![0] as string[]).not.toContain(bday.user.id);
      expect((call![1] as { body: string }).body).toContain('Fêté');
      expect((await t.repo(User).findOneByOrFail({ id: bday.user.id })).lastBirthdayReminderSentOn).toBe(today);
      push.sendToUsers.mockClear();
      await s.handleBirthdayReminders();
      expect(push.sendToUsers).not.toHaveBeenCalled();
    });
  });

  describe('awards windows', () => {
    it('season trophies open in early June and close from the 16th', async () => {
      const s = t.get<AwardsScheduler>(AwardsScheduler);
      const cats = t.repo(AwardCategory);
      at('2027-03-10T09:00:00Z');
      await s.handleSeasonVoteWindow(); // wrong month: nothing
      expect(await cats.count({ where: { season: '2026-2027' } })).toBe(0);

      at('2027-06-02T09:00:00Z');
      await s.handleSeasonVoteWindow();
      const opened = await cats.count({ where: { season: '2026-2027', isActive: true } });
      expect(opened).toBeGreaterThan(0);
      expect(titles(push.sendToUsers)).toContain('Trophées de fin de saison');
      await s.handleSeasonVoteWindow(); // idempotent
      expect(await cats.count({ where: { season: '2026-2027' } })).toBe(opened);

      push.sendToUsers.mockClear();
      at('2027-06-17T09:00:00Z');
      await s.handleSeasonVoteWindow();
      expect(await cats.count({ where: { season: '2026-2027', isActive: true } })).toBe(0);
      expect(titles(push.sendToUsers)).toContain('Trophées de la saison dévoilés');
    });

    it('the monthly award opens on the 1st when the club played, and closes on the 6th', async () => {
      const s = t.get<MonthlyAwardScheduler>(MonthlyAwardScheduler);
      const cats = t.repo(AwardCategory);
      const matches = t.repo(Match);
      await matches.save(matches.create({ date: '2026-10-14', opponent: 'Oct FC', homeAway: MatchHomeAway.HOME, status: MatchStatus.PLAYED }));
      at('2026-11-01T09:00:00Z');
      await s.handleMonthlyAwardWindow();
      const open = await cats.find({ where: { season: '2026-10', isActive: true } });
      expect(open.length).toBeGreaterThan(0);
      expect(titles(push.sendToUsers)).toContain('Joueur du mois');
      await s.handleMonthlyAwardWindow();
      expect(await cats.count({ where: { season: '2026-10' } })).toBe(open.length);

      at('2026-11-06T09:00:00Z');
      await s.handleMonthlyAwardWindow();
      expect(await cats.count({ where: { season: '2026-10', isActive: true } })).toBe(0);
      expect(titles(push.sendToUsers)).toContain('Joueur du mois dévoilé');

      // a month with no match at all is never opened
      at('2026-08-01T09:00:00Z');
      await s.handleMonthlyAwardWindow();
      expect(await cats.count({ where: { season: '2026-07' } })).toBe(0);
      // other days do nothing
      at('2026-11-15T09:00:00Z');
      await s.handleMonthlyAwardWindow();
    });
  });

  describe('housekeeping jobs', () => {
    it('the nightly badge sync visits every active user', async () => {
      await t.get<BadgesScheduler>(BadgesScheduler).handleNightlySync();
    });

    it('tops up open-ended recurring trainings and skips ended ones', async () => {
      const trainings = t.repo(Training);
      const open = await trainings.save(trainings.create({ title: 'Open', type: TrainingType.RECURRING, location: 'x', dayOfWeek: 4, startTime: '19:00', endTime: '20:00', startDate: ymd(-14), createdBy: coach.user.id }));
      const ended = await trainings.save(trainings.create({ title: 'Ended', type: TrainingType.RECURRING, location: 'x', dayOfWeek: 4, startTime: '19:00', endTime: '20:00', startDate: ymd(-90), endDate: ymd(-60), createdBy: coach.user.id }));
      await t.get<TrainingsScheduler>(TrainingsScheduler).handleSessionGenerationRollForward();
      const sessions = t.repo(TrainingSession);
      expect(await sessions.count({ where: { trainingId: open.id } })).toBeGreaterThan(5);
      expect(await sessions.count({ where: { trainingId: ended.id } })).toBe(0);
    });

    it('generates teams by itself 1h30 before kickoff, once', async () => {
      at('2026-09-22T12:00:00Z'); // 14:00 Paris
      const sessions = t.repo(TrainingSession);
      const session = await sessions.save(sessions.create({ date: '2026-09-22', startTime: '15:00', endTime: '16:30', location: 'x' }));
      const att = t.repo(Attendance);
      for (const p of players) await att.save(att.create({ trainingSessionId: session.id, userId: p.user.id, status: AttendanceStatus.PRESENT, respondedAt: new Date() }));
      const s = t.get<TeamBalancingScheduler>(TeamBalancingScheduler);
      await s.handleAutoGeneration();
      const teams = await t.repo(TrainingTeamAssignment).find({ where: { trainingSessionId: session.id } });
      expect(teams).toHaveLength(5);
      await s.handleAutoGeneration();
      expect(await t.repo(TrainingTeamAssignment).count({ where: { trainingSessionId: session.id } })).toBe(5);
    });
  });
});
