import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, LessThanOrEqual, Not, Repository } from 'typeorm';
import { Match, MatchStatus } from '../matches/entities/match.entity';
import { MatchAttendance } from '../matches/entities/match-attendance.entity';
import { MatchComposition } from '../matches/entities/match-composition.entity';
import { MatchMotmVote } from '../matches/entities/match-motm-vote.entity';
import { MatchDefenseBossVote } from '../matches/entities/match-defense-boss-vote.entity';
import { isMotmRevealed } from '../matches/motm-utils';
import { TrainingSession } from '../trainings/entities/training-session.entity';
import { Attendance } from '../attendances/entities/attendance.entity';
import { User, UserRole, UserStatus } from '../users/entities/user.entity';
import { AttendancePollReminder, PollReminderKind } from './entities/attendance-poll-reminder.entity';
import { PushNotificationsService } from './push-notifications.service';

@Injectable()
export class PushNotificationsScheduler {
  private readonly logger = new Logger(PushNotificationsScheduler.name);

  constructor(
    @InjectRepository(Match)
    private readonly matchesRepository: Repository<Match>,
    @InjectRepository(MatchAttendance)
    private readonly matchAttendancesRepository: Repository<MatchAttendance>,
    @InjectRepository(MatchComposition)
    private readonly compositionsRepository: Repository<MatchComposition>,
    @InjectRepository(MatchMotmVote)
    private readonly motmVotesRepository: Repository<MatchMotmVote>,
    @InjectRepository(MatchDefenseBossVote)
    private readonly defenseBossVotesRepository: Repository<MatchDefenseBossVote>,
    @InjectRepository(TrainingSession)
    private readonly sessionsRepository: Repository<TrainingSession>,
    @InjectRepository(Attendance)
    private readonly attendancesRepository: Repository<Attendance>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(AttendancePollReminder)
    private readonly pollRemindersRepository: Repository<AttendancePollReminder>,
    private readonly pushNotificationsService: PushNotificationsService,
  ) {}

  /** Role === PLAYER or a playing coach — matches the frontend's isRosterPlayer, i.e.
   * everyone actually expected to answer a presence poll. */
  private async findRosterPlayers(): Promise<User[]> {
    return this.usersRepository.find({
      where: [
        { role: UserRole.PLAYER, status: UserStatus.ACTIVE },
        { isPlayingCoach: true, status: UserStatus.ACTIVE },
      ],
    });
  }

  @Cron('0 0 9,21 * * *', { timeZone: 'Europe/Paris' })
  async handleMissingResultReminders() {
    const today = new Date().toISOString().slice(0, 10);
    const matches = await this.matchesRepository.find({
      where: {
        date: LessThan(today),
        status: MatchStatus.SCHEDULED,
        resultReminderSentAt: IsNull(),
      },
    });

    for (const match of matches) {
      try {
        await this.pushNotificationsService.sendToCoaches({
          title: 'Résultat manquant',
          body: `Le résultat du match contre ${match.opponent} du ${match.date} n'a pas encore été saisi.`,
          url: `/matches/${match.id}`,
        });
        match.resultReminderSentAt = new Date();
        await this.matchesRepository.save(match);
      } catch (error) {
        this.logger.warn(
          `Échec du rappel de résultat manquant pour le match ${match.id}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
  }

  @Cron('0 */15 * * * *', { timeZone: 'Europe/Paris' })
  async handleMissingAttendanceReminders() {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const candidateSessions = await this.sessionsRepository.find({
      where: {
        date: LessThanOrEqual(today),
        cancelled: false,
        attendanceReminderSentAt: IsNull(),
      },
    });

    for (const session of candidateSessions) {
      const sessionEnd = new Date(`${session.date}T${session.endTime}`);
      if (sessionEnd.getTime() > now.getTime()) continue;

      try {
        const validatedCount = await this.attendancesRepository.count({
          where: { trainingSessionId: session.id, actualStatus: Not(IsNull()) },
        });
        if (validatedCount === 0) {
          await this.pushNotificationsService.sendToCoaches({
            title: 'Pointage à faire',
            body: `Le pointage réel de l'entraînement du ${session.date} n'a pas encore été fait.`,
            url: '/trainings',
          });
        }
        session.attendanceReminderSentAt = new Date();
        await this.sessionsRepository.save(session);
      } catch (error) {
        this.logger.warn(
          `Échec du rappel de pointage manquant pour la séance ${session.id}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
  }

  /** Nudges anyone who hasn't answered the presence poll once a training is within 3h of
   * kickoff — right before team-generation locks presence in, this is the last realistic
   * chance for a late answer to still count. One-shot per (session, player) via
   * AttendancePollReminder, so it doesn't repeat every 15 minutes inside that 3h window. */
  @Cron('0 */15 * * * *', { timeZone: 'Europe/Paris' })
  async handleTrainingResponseReminders() {
    const now = Date.now();
    const sessions = await this.sessionsRepository.find({ where: { cancelled: false } });

    for (const session of sessions) {
      const diffMinutes = (new Date(`${session.date}T${session.startTime}`).getTime() - now) / 60000;
      if (diffMinutes <= 0 || diffMinutes > 180) continue;

      try {
        const [roster, responses, reminded] = await Promise.all([
          this.findRosterPlayers(),
          this.attendancesRepository.find({ where: { trainingSessionId: session.id } }),
          this.pollRemindersRepository.find({
            where: { kind: PollReminderKind.TRAINING, targetId: session.id },
          }),
        ]);
        const respondedIds = new Set(responses.map((a) => a.userId));
        const remindedIds = new Set(reminded.map((r) => r.userId));
        const targets = roster.filter((u) => !respondedIds.has(u.id) && !remindedIds.has(u.id));
        if (targets.length === 0) continue;

        await this.pushNotificationsService.sendToUsers(
          targets.map((u) => u.id),
          {
            title: 'Présence à confirmer',
            body: `Tu n'as pas encore répondu pour l'entraînement du ${session.date} — les équipes vont bientôt être tirées.`,
            url: `/trainings?session=${session.id}`,
          },
        );
        await this.pollRemindersRepository.save(
          targets.map((u) =>
            this.pollRemindersRepository.create({
              kind: PollReminderKind.TRAINING,
              targetId: session.id,
              userId: u.id,
            }),
          ),
        );
      } catch (error) {
        this.logger.warn(
          `Échec du rappel de présence pour la séance ${session.id}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
  }

  /** Same idea as handleTrainingResponseReminders, one day out from a match instead of 3h
   * out from a training — checked at the same twice-daily cadence as the missing-result
   * reminder, since it only depends on the date, not the exact time. */
  @Cron('0 0 9,21 * * *', { timeZone: 'Europe/Paris' })
  async handleMatchResponseReminders() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowKey = tomorrow.toISOString().slice(0, 10);

    const matches = await this.matchesRepository.find({
      where: { date: tomorrowKey, status: MatchStatus.SCHEDULED },
    });

    for (const match of matches) {
      try {
        const [roster, responses, reminded] = await Promise.all([
          this.findRosterPlayers(),
          this.matchAttendancesRepository.find({ where: { matchId: match.id } }),
          this.pollRemindersRepository.find({
            where: { kind: PollReminderKind.MATCH, targetId: match.id },
          }),
        ]);
        const respondedIds = new Set(responses.map((a) => a.userId));
        const remindedIds = new Set(reminded.map((r) => r.userId));
        const targets = roster.filter((u) => !respondedIds.has(u.id) && !remindedIds.has(u.id));
        if (targets.length === 0) continue;

        await this.pushNotificationsService.sendToUsers(
          targets.map((u) => u.id),
          {
            title: 'Présence à confirmer',
            body: `Tu n'as pas encore répondu pour le match contre ${match.opponent} demain.`,
            url: `/matches/${match.id}`,
          },
        );
        await this.pollRemindersRepository.save(
          targets.map((u) =>
            this.pollRemindersRepository.create({
              kind: PollReminderKind.MATCH,
              targetId: match.id,
              userId: u.id,
            }),
          ),
        );
      } catch (error) {
        this.logger.warn(
          `Échec du rappel de présence pour le match ${match.id}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
  }

  /** MOTM/patron de la défense reveal is computed live from votes (see motm-utils.ts), not
   * stored — this polls for the transition to revealed and fires a one-shot "come see the
   * result" push per match per vote, tracked on Match itself since it's a single broadcast
   * to the whole composition rather than a per-player thing. */
  @Cron('0 */15 * * * *', { timeZone: 'Europe/Paris' })
  async handleVoteRevealedNotifications() {
    const candidates = await this.matchesRepository.find({
      where: [
        { status: MatchStatus.PLAYED, motmRevealedNotifiedAt: IsNull() },
        { status: MatchStatus.PLAYED, defenseBossRevealedNotifiedAt: IsNull() },
      ],
    });

    for (const match of candidates) {
      try {
        const composition = await this.compositionsRepository.find({ where: { matchId: match.id } });
        const totalPlayers = composition.filter((c) => c.userId).length;
        const recipientIds = composition
          .map((c) => c.userId)
          .filter((id): id is string => !!id);
        let dirty = false;

        if (!match.motmRevealedNotifiedAt) {
          const votes = await this.motmVotesRepository.find({ where: { matchId: match.id } });
          if (isMotmRevealed(votes, totalPlayers)) {
            await this.pushNotificationsService.sendToUsers(recipientIds, {
              title: 'Homme du match révélé',
              body: `Le résultat du vote homme du match contre ${match.opponent} est disponible.`,
              url: `/matches/${match.id}`,
            });
            match.motmRevealedNotifiedAt = new Date();
            dirty = true;
          }
        }

        if (!match.defenseBossRevealedNotifiedAt) {
          const votes = await this.defenseBossVotesRepository.find({ where: { matchId: match.id } });
          if (isMotmRevealed(votes, totalPlayers)) {
            await this.pushNotificationsService.sendToUsers(recipientIds, {
              title: 'Patron de la défense révélé',
              body: `Le résultat du vote patron de la défense contre ${match.opponent} est disponible.`,
              url: `/matches/${match.id}`,
            });
            match.defenseBossRevealedNotifiedAt = new Date();
            dirty = true;
          }
        }

        if (dirty) await this.matchesRepository.save(match);
      } catch (error) {
        this.logger.warn(
          `Échec de la notification de révélation de vote pour le match ${match.id}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
  }
}
