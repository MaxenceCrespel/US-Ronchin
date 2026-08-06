import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Match } from '../matches/entities/match.entity';
import { MatchEvent, MatchEventType } from '../matches/entities/match-event.entity';
import { MatchComposition } from '../matches/entities/match-composition.entity';
import { PlayerRating } from '../matches/entities/player-rating.entity';
import { MatchMotmVote } from '../matches/entities/match-motm-vote.entity';
import { isMotmRevealed, computeMotmWinner } from '../matches/motm-utils';
import { Attendance, AttendanceStatus } from '../attendances/entities/attendance.entity';
import { TrainingSession } from '../trainings/entities/training-session.entity';
import { getCurrentSeasonLabel, getSeasonBounds, isInSeason, SeasonBounds } from './season.util';

const DEFAULT_RATING = 5; // midpoint of the 0-10 scale
const RATING_WEIGHT = 70;
const PERFORMANCE_WEIGHT = 30;

export interface PlayerStats {
  userId: string;
  firstName: string;
  lastName: string;
  matchesPlayed: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  trainingsPresent: number;
  trainingsResponded: number;
  trainingAttendanceRate: number | null;
  averageRating: number | null;
  ratingsCount: number;
  motmCount: number;
  presenceStreak: number;
  skillScore: number;
}

export interface DuoStats {
  scorerId: string;
  scorerName: string;
  assistId: string;
  assistName: string;
  count: number;
}

export interface MonthlyChallengeEntry {
  userId: string;
  firstName: string;
  lastName: string;
  value: number;
}

export interface MonthlyChallenges {
  topScorer: MonthlyChallengeEntry | null;
  mostPresent: MonthlyChallengeEntry | null;
}

/** What actually happened, not what the player declared beforehand — falls back to the
 * declaration only when the coach hasn't pointed the session yet. */
function effectiveStatus(a: Attendance): AttendanceStatus | null {
  return a.actualStatus ?? a.status;
}

@Injectable()
export class StatsService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Match)
    private readonly matchesRepository: Repository<Match>,
    @InjectRepository(MatchEvent)
    private readonly eventsRepository: Repository<MatchEvent>,
    @InjectRepository(MatchComposition)
    private readonly compositionsRepository: Repository<MatchComposition>,
    @InjectRepository(PlayerRating)
    private readonly ratingsRepository: Repository<PlayerRating>,
    @InjectRepository(Attendance)
    private readonly attendancesRepository: Repository<Attendance>,
    @InjectRepository(MatchMotmVote)
    private readonly motmVotesRepository: Repository<MatchMotmVote>,
    @InjectRepository(TrainingSession)
    private readonly sessionsRepository: Repository<TrainingSession>,
  ) {}

  private resolveSeasonBounds(season?: string): SeasonBounds | null {
    return season && season !== 'career' ? getSeasonBounds(season) : null;
  }

  /** Current run of consecutive PAST training sessions (excluding cancelled ones) each user was PRESENT at,
   * counting back from the most recent occurred session — breaks on the first ABSENT/MAYBE/no-response.
   * Scoped to `bounds` when provided: sessions outside the season don't count and don't extend the streak. */
  private async getPresenceStreaks(bounds: SeasonBounds | null = null): Promise<Map<string, number>> {
    const today = new Date().toISOString().slice(0, 10);
    const [sessions, attendances] = await Promise.all([
      this.sessionsRepository.find(),
      this.attendancesRepository.find(),
    ]);

    const pastSessions = sessions
      .filter((s) => !s.cancelled && s.date <= today && (!bounds || isInSeason(s.date, bounds)))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    const attendanceBySession = new Map<string, Attendance[]>();
    for (const a of attendances) {
      const list = attendanceBySession.get(a.trainingSessionId) ?? [];
      list.push(a);
      attendanceBySession.set(a.trainingSessionId, list);
    }

    const userIds = new Set(attendances.map((a) => a.userId));
    const streaks = new Map<string, number>();
    for (const userId of userIds) {
      let streak = 0;
      for (const session of pastSessions) {
        const attendance = attendanceBySession.get(session.id)?.find((a) => a.userId === userId);
        const status = attendance ? effectiveStatus(attendance) : null;
        if (status === AttendanceStatus.PRESENT) {
          streak += 1;
        } else if (status) {
          break;
        }
        // No response at all for this past session: skip without breaking or counting —
        // treated as "not yet answered" rather than a miss.
      }
      streaks.set(userId, streak);
    }
    return streaks;
  }

  private async getMotmCounts(bounds: SeasonBounds | null = null): Promise<Map<string, number>> {
    const [votes, compositions, matches] = await Promise.all([
      this.motmVotesRepository.find(),
      this.compositionsRepository.find(),
      bounds ? this.matchesRepository.find() : Promise.resolve([]),
    ]);

    const matchDateById = new Map(matches.map((m) => [m.id, m.date]));
    const inSeason = (matchId: string) =>
      !bounds || isInSeason(matchDateById.get(matchId) ?? '', bounds);

    const votesByMatch = new Map<string, typeof votes>();
    for (const vote of votes.filter((v) => inSeason(v.matchId))) {
      const list = votesByMatch.get(vote.matchId) ?? [];
      list.push(vote);
      votesByMatch.set(vote.matchId, list);
    }

    const playersByMatch = new Map<string, number>();
    for (const entry of compositions.filter((c) => inSeason(c.matchId))) {
      playersByMatch.set(entry.matchId, (playersByMatch.get(entry.matchId) ?? 0) + 1);
    }

    const counts = new Map<string, number>();
    for (const [matchId, matchVotes] of votesByMatch) {
      const totalPlayers = playersByMatch.get(matchId) ?? 0;
      if (!isMotmRevealed(matchVotes, totalPlayers)) continue;
      const winnerId = computeMotmWinner(matchVotes);
      if (winnerId) counts.set(winnerId, (counts.get(winnerId) ?? 0) + 1);
    }
    return counts;
  }

  async getPlayerStats(season?: string): Promise<PlayerStats[]> {
    const bounds = this.resolveSeasonBounds(season);
    const [users, allEvents, allCompositions, allRatings, allAttendances, matches, sessions, motmCounts, presenceStreaks] =
      await Promise.all([
        this.usersRepository.find(),
        this.eventsRepository.find(),
        this.compositionsRepository.find(),
        this.ratingsRepository.find(),
        this.attendancesRepository.find(),
        bounds ? this.matchesRepository.find() : Promise.resolve([]),
        bounds ? this.sessionsRepository.find() : Promise.resolve([]),
        this.getMotmCounts(bounds),
        this.getPresenceStreaks(bounds),
      ]);

    const matchDateById = new Map(matches.map((m) => [m.id, m.date]));
    const sessionDateById = new Map(sessions.map((s) => [s.id, s.date]));
    const matchInSeason = (matchId: string) =>
      !bounds || isInSeason(matchDateById.get(matchId) ?? '', bounds);
    const sessionInSeason = (trainingSessionId: string) =>
      !bounds || isInSeason(sessionDateById.get(trainingSessionId) ?? '', bounds);

    const events = allEvents.filter((e) => matchInSeason(e.matchId));
    const compositions = allCompositions.filter((c) => matchInSeason(c.matchId));
    const ratings = allRatings.filter((r) => matchInSeason(r.matchId));
    const attendances = allAttendances.filter((a) => sessionInSeason(a.trainingSessionId));

    return users.map((user) => {
      const matchesPlayed = compositions.filter((c) => c.userId === user.id).length;
      const goals = events.filter(
        (e) => e.type === MatchEventType.GOAL && e.userId === user.id,
      ).length;
      const assists = events.filter(
        (e) => e.type === MatchEventType.GOAL && e.assistUserId === user.id,
      ).length;
      const yellowCards = events.filter(
        (e) => e.type === MatchEventType.YELLOW_CARD && e.userId === user.id,
      ).length;
      const redCards = events.filter(
        (e) => e.type === MatchEventType.RED_CARD && e.userId === user.id,
      ).length;

      const userAttendances = attendances.filter((a) => a.userId === user.id);
      const trainingsPresent = userAttendances.filter(
        (a) => effectiveStatus(a) === AttendanceStatus.PRESENT,
      ).length;
      const trainingsResponded = userAttendances.length;

      const userRatings = ratings.filter((r) => r.ratedUserId === user.id);
      const averageRating =
        userRatings.length > 0
          ? userRatings.reduce((sum, r) => sum + r.rating, 0) / userRatings.length
          : null;

      const involvementPerMatch = matchesPlayed > 0 ? (goals + assists) / matchesPlayed : 0;
      const ratingComponent = ((averageRating ?? DEFAULT_RATING) / 10) * RATING_WEIGHT;
      const performanceComponent = Math.min(involvementPerMatch, 1) * PERFORMANCE_WEIGHT;
      const skillScore = Math.round(ratingComponent + performanceComponent);

      return {
        userId: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        matchesPlayed,
        goals,
        assists,
        yellowCards,
        redCards,
        trainingsPresent,
        trainingsResponded,
        trainingAttendanceRate:
          trainingsResponded > 0 ? trainingsPresent / trainingsResponded : null,
        averageRating,
        ratingsCount: userRatings.length,
        motmCount: motmCounts.get(user.id) ?? 0,
        presenceStreak: presenceStreaks.get(user.id) ?? 0,
        skillScore,
      };
    });
  }

  async getTeamStats(season?: string) {
    const bounds = this.resolveSeasonBounds(season);
    const [playerStats, allEvents, matches] = await Promise.all([
      this.getPlayerStats(season),
      this.eventsRepository.find(),
      bounds ? this.matchesRepository.find() : Promise.resolve([]),
    ]);
    const matchDateById = new Map(matches.map((m) => [m.id, m.date]));
    const events = bounds
      ? allEvents.filter((e) => isInSeason(matchDateById.get(e.matchId) ?? '', bounds))
      : allEvents;

    const topScorers = [...playerStats]
      .filter((p) => p.goals > 0)
      .sort((a, b) => b.goals - a.goals)
      .slice(0, 5);

    const topAssists = [...playerStats]
      .filter((p) => p.assists > 0)
      .sort((a, b) => b.assists - a.assists)
      .slice(0, 5);

    const mostDecisive = [...playerStats]
      .filter((p) => p.goals + p.assists > 0)
      .sort((a, b) => b.goals + b.assists - (a.goals + a.assists))
      .slice(0, 5);

    const duoCounts = new Map<string, DuoStats>();
    for (const event of events) {
      if (event.type !== MatchEventType.GOAL || !event.assistUserId) continue;
      const key = `${event.userId}:${event.assistUserId}`;
      const scorer = playerStats.find((p) => p.userId === event.userId);
      const assister = playerStats.find((p) => p.userId === event.assistUserId);
      if (!scorer || !assister) continue;

      const existing = duoCounts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        duoCounts.set(key, {
          scorerId: scorer.userId,
          scorerName: `${scorer.firstName} ${scorer.lastName}`,
          assistId: assister.userId,
          assistName: `${assister.firstName} ${assister.lastName}`,
          count: 1,
        });
      }
    }

    const bestDuos = [...duoCounts.values()].sort((a, b) => b.count - a.count).slice(0, 5);

    return { topScorers, topAssists, mostDecisive, bestDuos };
  }

  async getMonthlyChallenges(): Promise<MonthlyChallenges> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

    const topScorerRaw = await this.eventsRepository
      .createQueryBuilder('event')
      .innerJoin('event.match', 'match')
      .innerJoin('event.user', 'user')
      .where('event.type = :type', { type: MatchEventType.GOAL })
      .andWhere('match.date BETWEEN :start AND :end', { start: monthStart, end: monthEnd })
      .select('event.userId', 'userId')
      .addSelect('user.firstName', 'firstName')
      .addSelect('user.lastName', 'lastName')
      .addSelect('COUNT(*)', 'value')
      .groupBy('event.userId')
      .addGroupBy('user.firstName')
      .addGroupBy('user.lastName')
      .orderBy('"value"', 'DESC')
      .limit(1)
      .getRawOne<{ userId: string; firstName: string; lastName: string; value: string }>();

    const mostPresentRaw = await this.attendancesRepository
      .createQueryBuilder('attendance')
      .innerJoin('attendance.trainingSession', 'session')
      .innerJoin('attendance.user', 'user')
      .where('COALESCE(attendance.actual_status::text, attendance.status::text) = :status', {
        status: AttendanceStatus.PRESENT,
      })
      .andWhere('session.date BETWEEN :start AND :end', { start: monthStart, end: monthEnd })
      .select('attendance.userId', 'userId')
      .addSelect('user.firstName', 'firstName')
      .addSelect('user.lastName', 'lastName')
      .addSelect('COUNT(*)', 'value')
      .groupBy('attendance.userId')
      .addGroupBy('user.firstName')
      .addGroupBy('user.lastName')
      .orderBy('"value"', 'DESC')
      .limit(1)
      .getRawOne<{ userId: string; firstName: string; lastName: string; value: string }>();

    return {
      topScorer: topScorerRaw
        ? {
            userId: topScorerRaw.userId,
            firstName: topScorerRaw.firstName,
            lastName: topScorerRaw.lastName,
            value: Number(topScorerRaw.value),
          }
        : null,
      mostPresent: mostPresentRaw
        ? {
            userId: mostPresentRaw.userId,
            firstName: mostPresentRaw.firstName,
            lastName: mostPresentRaw.lastName,
            value: Number(mostPresentRaw.value),
          }
        : null,
    };
  }

  async getAvailableSeasons(): Promise<{ seasons: string[]; current: string }> {
    const current = getCurrentSeasonLabel();
    const [oldestMatch, oldestSession] = await Promise.all([
      this.matchesRepository
        .createQueryBuilder('match')
        .select('MIN(match.date)', 'min')
        .getRawOne<{ min: string | null }>(),
      this.sessionsRepository
        .createQueryBuilder('session')
        .select('MIN(session.date)', 'min')
        .getRawOne<{ min: string | null }>(),
    ]);

    const oldestDate = [oldestMatch?.min, oldestSession?.min]
      .filter((d): d is string => !!d)
      .sort()[0];

    const currentStartYear = Number(current.split('-')[0]);
    const oldestStartYear = oldestDate
      ? Number(getCurrentSeasonLabel(new Date(oldestDate)).split('-')[0])
      : currentStartYear;

    const seasons: string[] = [];
    for (let year = currentStartYear; year >= oldestStartYear; year--) {
      seasons.push(`${year}-${year + 1}`);
    }

    return { seasons, current };
  }
}
