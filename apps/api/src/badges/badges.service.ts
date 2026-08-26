import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UserBadge } from './entities/user-badge.entity';
import { GoalType, MatchEvent, MatchEventType } from '../matches/entities/match-event.entity';
import { MatchComposition } from '../matches/entities/match-composition.entity';
import { MatchMotmVote } from '../matches/entities/match-motm-vote.entity';
import { MatchDefenseBossVote } from '../matches/entities/match-defense-boss-vote.entity';
import { isMotmRevealed, computeMotmWinners, resolveWinnerUserIds } from '../matches/motm-utils';
import { Match } from '../matches/entities/match.entity';
import { MatchAttendance } from '../matches/entities/match-attendance.entity';
import { PlayerRating } from '../matches/entities/player-rating.entity';
import { Attendance, AttendanceStatus } from '../attendances/entities/attendance.entity';
import { PlayerPosition, User } from '../users/entities/user.entity';
import { TrainingSession } from '../trainings/entities/training-session.entity';
import { BADGE_DEFINITIONS, BadgeCategory, BadgeRarity } from './badge-definitions';
import { StatsService } from '../stats/stats.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { getCurrentSeasonLabel } from '../stats/season.util';

/** What actually happened at training, not what the player declared beforehand. */
function effectiveStatus(a: Attendance): AttendanceStatus | null {
  return a.actualStatus ?? a.status;
}

function isWeekendDate(isoDate: string): boolean {
  const day = new Date(`${isoDate}T00:00:00`).getDay();
  return day === 0 || day === 6;
}

function shiftDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function isDecemberOrJanuary(isoDate: string): boolean {
  const month = isoDate.slice(5, 7);
  return month === '12' || month === '01';
}

function daysBetween(isoDateA: string, isoDateB: string): number {
  const a = new Date(`${isoDateA}T00:00:00`).getTime();
  const b = new Date(`${isoDateB}T00:00:00`).getTime();
  return Math.abs(b - a) / 86_400_000;
}

const BIRTHDAY_WINDOW_DAYS = 3; // ±3 days = the week of the birthday, not just the exact day

/** Whether `isoDate` falls within `BIRTHDAY_WINDOW_DAYS` of the given birth date's month-day,
 * in any year — checks the birthday's occurrence in the surrounding years too so a birthday near
 * Dec 31/Jan 1 doesn't lose its window across the year boundary. */
function isNearBirthday(isoDate: string, birthDate: string): boolean {
  const year = Number(isoDate.slice(0, 4));
  const monthDay = birthDate.slice(5, 10);
  return [year - 1, year, year + 1].some(
    (y) => daysBetween(isoDate, `${y}-${monthDay}`) <= BIRTHDAY_WINDOW_DAYS,
  );
}

/** Badges that reward a feat achievable multiple times within a single match — each
 * occurrence bumps the badge's own count instead of only ever being earned once. */
const REPEATABLE_BADGE_KEYS = new Set([
  'hat_trick',
  'poker',
  'double',
  'duo_magique',
  'clean_sheet',
  'portier',
  'super_sub',
  'braquage',
  'traiteur',
  'cadeau_anniversaire',
  'jekyll_hyde',
  'impact_immediat',
  'box_to_box',
]);

/** Minimum number of training+match "occasions" within a calendar month for Le Mois Parfait
 * to be meaningful — a month with just one session shouldn't count as a perfect month. */
const MOIS_PARFAIT_MIN_OCCASIONS = 3;

/** Badges that describe a standing (a comparative "currently true" title, e.g. "most
 * matches without X"), not a one-off feat — every other badge is kept forever once earned,
 * but these get their row deleted the moment they stop being true, so they stay evolutive
 * instead of piling up on whoever briefly held the record. */
const REVOCABLE_BADGE_KEYS = new Set(['dernier_de_cordee']);

const RARITY_WEIGHT: Record<BadgeRarity, number> = {
  COMMON: 1,
  RARE: 3,
  EPIC: 8,
  LEGENDARY: 20,
};

export type AccountTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND' | 'RUBY';

const TIER_THRESHOLDS: { tier: AccountTier; minScore: number }[] = [
  { tier: 'BRONZE', minScore: 0 },
  { tier: 'SILVER', minScore: 5 },
  { tier: 'GOLD', minScore: 15 },
  { tier: 'PLATINUM', minScore: 30 },
  { tier: 'DIAMOND', minScore: 55 },
  { tier: 'RUBY', minScore: 90 },
];

export interface AccountLevel {
  score: number;
  tier: AccountTier;
  nextTier: AccountTier | null;
  nextTierScore: number | null;
}

export interface BadgeStatus {
  key: string;
  category: BadgeCategory;
  rarity: BadgeRarity;
  title: string;
  description: string;
  emoji: string;
  earned: boolean;
  earnedAt: Date | null;
  count: number;
  /** Only set for badges with a simple numeric threshold — lets the UI show "14/20". */
  progress: { current: number; target: number } | null;
}

@Injectable()
export class BadgesService {
  constructor(
    @InjectRepository(UserBadge)
    private readonly badgesRepository: Repository<UserBadge>,
    @InjectRepository(MatchEvent)
    private readonly eventsRepository: Repository<MatchEvent>,
    @InjectRepository(MatchComposition)
    private readonly compositionsRepository: Repository<MatchComposition>,
    @InjectRepository(Attendance)
    private readonly attendancesRepository: Repository<Attendance>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(TrainingSession)
    private readonly sessionsRepository: Repository<TrainingSession>,
    @InjectRepository(MatchMotmVote)
    private readonly motmVotesRepository: Repository<MatchMotmVote>,
    @InjectRepository(MatchDefenseBossVote)
    private readonly defenseBossVotesRepository: Repository<MatchDefenseBossVote>,
    @InjectRepository(Match)
    private readonly matchesRepository: Repository<Match>,
    @InjectRepository(MatchAttendance)
    private readonly matchAttendancesRepository: Repository<MatchAttendance>,
    @InjectRepository(PlayerRating)
    private readonly ratingsRepository: Repository<PlayerRating>,
    private readonly statsService: StatsService,
    private readonly pushNotificationsService: PushNotificationsService,
  ) {}

  async getForUser(userId: string): Promise<BadgeStatus[]> {
    const allStats = await this.statsService.getPlayerStats();
    const stats = allStats.find((p) => p.userId === userId);
    let progressByKey: Record<string, { current: number; target: number }> = {};

    if (stats) {
      // All events involving this user, either as the actor (userId) or as the
      // assist provider (assistUserId) — badges like "Duo Magique" need both.
      const [
        eventsAsActor,
        eventsAsAssist,
        myComposition,
        myAttendances,
        me,
        allSessions,
        myMatchAttendances,
        myRatings,
        allMatches,
      ] = await Promise.all([
        this.eventsRepository.find({ where: { userId }, relations: { match: true } }),
        this.eventsRepository.find({ where: { assistUserId: userId }, relations: { match: true } }),
        this.compositionsRepository.find({ where: { userId }, relations: { match: true } }),
        this.attendancesRepository.find({
          where: { userId },
          relations: { trainingSession: true },
        }),
        this.usersRepository.findOne({ where: { id: userId } }),
        this.sessionsRepository.find(),
        this.matchAttendancesRepository.find({ where: { userId } }),
        this.ratingsRepository.find({ where: { ratedUserId: userId }, relations: { match: true } }),
        this.matchesRepository.find(),
      ]);

      const myMatchIds = myComposition.map((c) => c.matchId);
      const [motmVotesForMyMatches, compositionsForMyMatches] =
        myMatchIds.length > 0
          ? await Promise.all([
              this.motmVotesRepository.find({ where: { matchId: In(myMatchIds) } }),
              this.compositionsRepository.find({ where: { matchId: In(myMatchIds) } }),
            ])
          : [[], []];

      const goalsByMatch = new Map<string, number>();
      const yellowMatches = new Set<string>();
      const redMatches = new Set<string>();
      const goalTypeCounts = new Map<GoalType, number>();
      for (const event of eventsAsActor) {
        if (event.type === MatchEventType.GOAL) {
          goalsByMatch.set(event.matchId, (goalsByMatch.get(event.matchId) ?? 0) + 1);
          if (event.goalType) {
            goalTypeCounts.set(event.goalType, (goalTypeCounts.get(event.goalType) ?? 0) + 1);
          }
        } else if (event.type === MatchEventType.YELLOW_CARD) {
          yellowMatches.add(event.matchId);
        } else if (event.type === MatchEventType.RED_CARD) {
          redMatches.add(event.matchId);
        }
      }
      const hasAigleDesSurfaces = (goalTypeCounts.get(GoalType.HEAD) ?? 0) >= 3;
      const hasSpecialiste = (goalTypeCounts.get(GoalType.PENALTY) ?? 0) >= 3;
      const hatTrickCount = [...goalsByMatch.values()].filter((c) => c >= 3).length;
      const hasHatTrick = hatTrickCount > 0;
      const pokerCount = [...goalsByMatch.values()].filter((c) => c >= 4).length;
      const hasPoker = pokerCount > 0;
      const jekyllHydeCount = [...goalsByMatch.keys()].filter((matchId) => redMatches.has(matchId)).length;
      const hasJekyllHyde = jekyllHydeCount > 0;

      const assistMatchIds = new Set(eventsAsAssist.map((e) => e.matchId));
      const duoMagiqueCount = [...goalsByMatch.keys()].filter((matchId) => assistMatchIds.has(matchId)).length;
      const hasDuoMagique = duoMagiqueCount > 0;

      const cleanSheetCount = myComposition.filter((c) => {
        const m = c.match;
        if (!m || m.status !== 'PLAYED' || m.scoreHome == null || m.scoreAway == null) return false;
        if (!c.isStarter || c.position !== PlayerPosition.DEFENDER) return false;
        const concededByUs = m.homeAway === 'HOME' ? m.scoreAway : m.scoreHome;
        return concededByUs === 0;
      }).length;
      const hasCleanSheet = cleanSheetCount > 0;
      const hasRoc = cleanSheetCount >= 5;
      const hasForteresse = cleanSheetCount >= 10;
      const hasInebranlable = cleanSheetCount >= 20;

      const goalkeeperCleanSheetCount = myComposition.filter((c) => {
        const m = c.match;
        if (!m || m.status !== 'PLAYED' || m.scoreHome == null || m.scoreAway == null) return false;
        if (!c.isStarter || c.position !== PlayerPosition.GOALKEEPER) return false;
        const concededByUs = m.homeAway === 'HOME' ? m.scoreAway : m.scoreHome;
        return concededByUs === 0;
      }).length;
      const hasPortier = goalkeeperCleanSheetCount > 0;
      const hasMainsOr = goalkeeperCleanSheetCount >= 5;
      const hasMainsDiamant = goalkeeperCleanSheetCount >= 10;
      const hasMainsLegendaires = goalkeeperCleanSheetCount >= 20;

      const defenderStartCount = myComposition.filter(
        (c) => c.isStarter && c.position === PlayerPosition.DEFENDER && c.match?.status === 'PLAYED',
      ).length;
      const hasVeteranDefense = defenderStartCount >= 15;
      const hasCadreDefensif = defenderStartCount >= 30;
      const hasLegendeArriereGarde = defenderStartCount >= 50;

      const starterMatchCount = myComposition.filter(
        (c) => c.isStarter && c.match?.status === 'PLAYED',
      ).length;

      const positionsPlayed = new Set(
        myComposition.map((c) => c.position).filter((p): p is PlayerPosition => !!p),
      );
      const hasPolyvalent = positionsPlayed.size >= 4;

      const superSubCount = myComposition.filter(
        (c) => !c.isStarter && (goalsByMatch.get(c.matchId) ?? 0) > 0,
      ).length;
      const hasSuperSub = superSubCount > 0;

      const impactImmediatCount = myComposition.filter(
        (c) => !c.isStarter && assistMatchIds.has(c.matchId),
      ).length;
      const hasImpactImmediat = impactImmediatCount > 0;

      const awayCount = myComposition.filter((c) => c.match?.homeAway === 'AWAY').length;

      const appearanceDates = myComposition
        .map((c) => c.match)
        .filter((m): m is Match => !!m && m.status === 'PLAYED')
        .map((m) => m.date)
        .sort();
      let hasInterimaire = false;
      for (let i = 1; i < appearanceDates.length; i++) {
        if (daysBetween(appearanceDates[i - 1], appearanceDates[i]) >= 30) {
          hasInterimaire = true;
          break;
        }
      }

      const today = new Date().toISOString().slice(0, 10);
      const decJanSessions = allSessions.filter(
        (s) => !s.cancelled && s.date <= today && isDecemberOrJanuary(s.date),
      );
      const hasSurvivantHiver =
        decJanSessions.length > 0 &&
        decJanSessions.every((s) => {
          const a = myAttendances.find((at) => at.trainingSessionId === s.id);
          return a?.actualStatus === AttendanceStatus.PRESENT;
        });

      const hasBeauParleur = myAttendances.some(
        (a) => a.status === AttendanceStatus.PRESENT && a.actualStatus === AttendanceStatus.ABSENT,
      );
      const hasInviteSurprise = myAttendances.some(
        (a) => a.status !== AttendanceStatus.PRESENT && a.actualStatus === AttendanceStatus.PRESENT,
      );

      const weekendMatches = myComposition
        .map((c) => c.match)
        .filter((m): m is Match => !!m && m.status === 'PLAYED' && isWeekendDate(m.date));
      const hasFootballeurDimanche = weekendMatches.some((m) => {
        const weekBefore = shiftDate(m.date, -7);
        // Only a real "skipped training" if a session actually existed in that window —
        // otherwise every player picking up their very first match of the season (before
        // any training had even happened yet) would wrongly earn this.
        const sessionsInWindow = allSessions.filter(
          (s) => !s.cancelled && s.date >= weekBefore && s.date < m.date,
        );
        if (sessionsInWindow.length === 0) return false;
        return !myAttendances.some(
          (a) =>
            a.trainingSession &&
            a.trainingSession.date >= weekBefore &&
            a.trainingSession.date < m.date &&
            effectiveStatus(a) === AttendanceStatus.PRESENT,
        );
      });

      const resultOf = (m: Match): 'W' | 'D' | 'L' => {
        const us = m.homeAway === 'HOME' ? m.scoreHome! : m.scoreAway!;
        const them = m.homeAway === 'HOME' ? m.scoreAway! : m.scoreHome!;
        return us > them ? 'W' : us < them ? 'L' : 'D';
      };
      const playedMatches = myComposition
        .map((c) => c.match)
        .filter((m): m is Match => !!m && m.status === 'PLAYED' && m.scoreHome != null && m.scoreAway != null)
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

      let maxWinStreak = 0;
      let maxLossStreak = 0;
      let curWin = 0;
      let curLoss = 0;
      for (const m of playedMatches) {
        const result = resultOf(m);
        curWin = result === 'W' ? curWin + 1 : 0;
        curLoss = result === 'L' ? curLoss + 1 : 0;
        maxWinStreak = Math.max(maxWinStreak, curWin);
        maxLossStreak = Math.max(maxLossStreak, curLoss);
      }

      const doubleCount = [...goalsByMatch.values()].filter((c) => c >= 2).length;
      const hasDouble = doubleCount > 0;

      const isMatchWin = (m: Match) =>
        m.status === 'PLAYED' &&
        m.scoreHome != null &&
        m.scoreAway != null &&
        (m.homeAway === 'HOME' ? m.scoreHome > m.scoreAway : m.scoreAway > m.scoreHome);
      const birthdayGoalCount = me?.birthDate
        ? eventsAsActor.filter(
            (e) => e.type === MatchEventType.GOAL && e.match && isNearBirthday(e.match.date, me.birthDate!),
          ).length
        : 0;
      const hasBirthdayGoal = birthdayGoalCount > 0;

      const assistsByMatch = new Map<string, number>();
      for (const e of eventsAsAssist) {
        assistsByMatch.set(e.matchId, (assistsByMatch.get(e.matchId) ?? 0) + 1);
      }
      const traiteurCount = [...assistsByMatch.values()].filter((c) => c >= 2).length;
      const hasTraiteur = traiteurCount > 0;

      // Chronological timeline of goal contributions — longest run of assists
      // uninterrupted by a goal, across matches.
      const contributions = [
        ...eventsAsActor
          .filter((e) => e.type === MatchEventType.GOAL && e.match)
          .map((e) => ({ date: e.match!.date, minute: e.minute ?? 0, type: 'GOAL' as const })),
        ...eventsAsAssist
          .filter((e) => e.match)
          .map((e) => ({ date: e.match!.date, minute: e.minute ?? 0, type: 'ASSIST' as const })),
      ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.minute - b.minute));

      let assistStreak = 0;
      let maxAssistStreak = 0;
      for (const c of contributions) {
        assistStreak = c.type === 'ASSIST' ? assistStreak + 1 : 0;
        maxAssistStreak = Math.max(maxAssistStreak, assistStreak);
      }
      const hasPereNoel = maxAssistStreak >= 5;

      let altruisteStreak = 0;
      let maxAltruisteStreak = 0;
      let noCardStreak = 0;
      let maxNoCardStreak = 0;
      let panneSecheStreak = 0;
      let maxPanneSecheStreak = 0;
      let cadenasStreak = 0;
      let maxCadenasStreak = 0;
      let gkCadenasStreak = 0;
      let maxGkCadenasStreak = 0;
      let benchStreak = 0;
      let maxBenchStreak = 0;
      let hasEquilibriste = false;
      let boxToBoxCount = 0;
      for (let i = 0; i < playedMatches.length; i++) {
        const m = playedMatches[i];
        const goalsInMatch = goalsByMatch.get(m.id) ?? 0;
        const assistsInMatch = assistsByMatch.get(m.id) ?? 0;
        const hasCard = yellowMatches.has(m.id) || redMatches.has(m.id);
        const concededByUs = m.homeAway === 'HOME' ? m.scoreAway! : m.scoreHome!;
        const comp = myComposition.find((c) => c.matchId === m.id);

        altruisteStreak = assistsInMatch >= 1 && goalsInMatch === 0 ? altruisteStreak + 1 : 0;
        maxAltruisteStreak = Math.max(maxAltruisteStreak, altruisteStreak);

        noCardStreak = hasCard ? 0 : noCardStreak + 1;
        maxNoCardStreak = Math.max(maxNoCardStreak, noCardStreak);

        panneSecheStreak = goalsInMatch === 0 && assistsInMatch === 0 ? panneSecheStreak + 1 : 0;
        maxPanneSecheStreak = Math.max(maxPanneSecheStreak, panneSecheStreak);

        const startedAsDefender = comp?.isStarter && comp.position === PlayerPosition.DEFENDER;
        cadenasStreak = startedAsDefender && concededByUs === 0 ? cadenasStreak + 1 : 0;
        maxCadenasStreak = Math.max(maxCadenasStreak, cadenasStreak);

        const startedAsGoalkeeper = comp?.isStarter && comp.position === PlayerPosition.GOALKEEPER;
        gkCadenasStreak = startedAsGoalkeeper && concededByUs === 0 ? gkCadenasStreak + 1 : 0;
        maxGkCadenasStreak = Math.max(maxGkCadenasStreak, gkCadenasStreak);

        const startedAsMidfielder = comp?.isStarter && comp.position === PlayerPosition.MIDFIELDER;
        if (startedAsMidfielder && goalsInMatch > 0 && assistsInMatch > 0) boxToBoxCount += 1;

        const isBench = comp ? !comp.isStarter : false;
        benchStreak = isBench ? benchStreak + 1 : 0;
        maxBenchStreak = Math.max(maxBenchStreak, benchStreak);

        if (i + 2 < playedMatches.length) {
          const results = new Set([
            resultOf(m),
            resultOf(playedMatches[i + 1]),
            resultOf(playedMatches[i + 2]),
          ]);
          if (results.size === 3) hasEquilibriste = true;
        }
      }
      const hasAltruiste = maxAltruisteStreak >= 3;
      const hasSangFroid = maxNoCardStreak >= 20;
      const hasPanneSeche = maxPanneSecheStreak >= 10;
      const hasCadenas = maxCadenasStreak >= 3;
      const hasVerrou = maxGkCadenasStreak >= 3;
      const hasBoxToBox = boxToBoxCount > 0;
      const hasGardeDuCorps = maxBenchStreak >= 5;

      const braquageCount = playedMatches.filter(
        (m) => isMatchWin(m) && m.scoreHome! + m.scoreAway! === 1 && goalsByMatch.has(m.id),
      ).length;
      const hasBraquage = braquageCount > 0;

      const hasNaufrage = playedMatches.some(
        (m) => resultOf(m) === 'L' && Math.abs(m.scoreHome! - m.scoreAway!) >= 4,
      );

      const scorerMatchesByAssistTarget = new Map<string, Set<string>>();
      for (const e of eventsAsAssist) {
        if (!e.userId) continue; // scorer not a registered account — no partner to track
        const set = scorerMatchesByAssistTarget.get(e.userId) ?? new Set<string>();
        set.add(e.matchId);
        scorerMatchesByAssistTarget.set(e.userId, set);
      }
      const hasFreresDarmes = [...scorerMatchesByAssistTarget.values()].some((s) => s.size >= 2);

      const votesByMatch = new Map<string, MatchMotmVote[]>();
      for (const v of motmVotesForMyMatches) {
        const list = votesByMatch.get(v.matchId) ?? [];
        list.push(v);
        votesByMatch.set(v.matchId, list);
      }
      const playersByMatch = new Map<string, number>();
      for (const c of compositionsForMyMatches) {
        if (!c.userId) continue; // guest, can't vote
        playersByMatch.set(c.matchId, (playersByMatch.get(c.matchId) ?? 0) + 1);
      }
      // computeMotmWinners returns MatchComposition ids, not User ids — resolve them back.
      const compositionByIdForMyMatches = new Map(compositionsForMyMatches.map((c) => [c.id, c]));
      const hasIncompris = playedMatches.some((m) => {
        if (resultOf(m) !== 'L') return false;
        const matchVotes = votesByMatch.get(m.id) ?? [];
        const totalPlayers = playersByMatch.get(m.id) ?? 0;
        if (!isMotmRevealed(matchVotes, totalPlayers)) return false;
        // A tie counts too — being one of several joint MOTM winners still qualifies.
        const winnerUserIds = resolveWinnerUserIds(
          computeMotmWinners(matchVotes),
          compositionByIdForMyMatches,
        );
        return winnerUserIds.includes(userId);
      });

      // Meant to single out ONE unlucky player — with a small squad, several players often
      // tie on matches played, and awarding it to everyone tied made it common rather than
      // the rare, singular badge its EPIC rarity and description promise. Only stands when
      // exactly one player holds that max.
      const zeroMotmPlayers = allStats.filter((p) => p.motmCount === 0 && p.matchesPlayed > 0);
      const maxZeroMotmMatches =
        zeroMotmPlayers.length > 0 ? Math.max(...zeroMotmPlayers.map((p) => p.matchesPlayed)) : 0;
      const playersAtMaxZeroMotm = zeroMotmPlayers.filter((p) => p.matchesPlayed === maxZeroMotmMatches);
      const hasDernierDeCordee =
        stats.motmCount === 0 &&
        stats.matchesPlayed > 0 &&
        stats.matchesPlayed === maxZeroMotmMatches &&
        playersAtMaxZeroMotm.length === 1;

      const myMotmVoteMatchIds = new Set(
        motmVotesForMyMatches.filter((v) => v.voterId === userId).map((v) => v.matchId),
      );
      const hasFairPlay =
        playedMatches.length > 0 && playedMatches.every((m) => myMotmVoteMatchIds.has(m.id));

      const hasTaulier = stats.matchesPlayed >= 10 && starterMatchCount / stats.matchesPlayed >= 0.8;

      const seasonsActive = new Set<string>();
      for (const m of playedMatches) {
        seasonsActive.add(getCurrentSeasonLabel(new Date(`${m.date}T00:00:00`)));
      }
      for (const a of myAttendances) {
        if (effectiveStatus(a) === AttendanceStatus.PRESENT && a.trainingSession) {
          seasonsActive.add(getCurrentSeasonLabel(new Date(`${a.trainingSession.date}T00:00:00`)));
        }
      }
      const hasHistorique = seasonsActive.size >= 3;

      // "Note moyenne sur 3 matchs" — the per-match average (not each individual note) of the
      // 3 most recently rated matches, so a match rated by many teammates doesn't outweigh one
      // rated by few.
      const ratingsByMatch = new Map<string, { date: string; ratings: number[] }>();
      for (const r of myRatings) {
        if (!r.match || r.match.status !== 'PLAYED') continue;
        const entry = ratingsByMatch.get(r.matchId) ?? { date: r.match.date, ratings: [] };
        entry.ratings.push(r.rating);
        ratingsByMatch.set(r.matchId, entry);
      }
      const last3Rated = [...ratingsByMatch.values()]
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
        .slice(-3)
        .map((entry) => entry.ratings.reduce((sum, v) => sum + v, 0) / entry.ratings.length);
      const hasMetronome =
        last3Rated.length >= 3 && last3Rated.reduce((sum, avg) => sum + avg, 0) / last3Rated.length > 7;

      // Le Mois Parfait — 100% présence (entraînements + matchs) sur un mois calendaire donné,
      // un mois avec trop peu d'occasions ne compte pas. Non-réponse = absent, comme partout
      // ailleurs dans l'app : un joueur qui n'a jamais répondu ne doit pas être compté par défaut.
      const myTrainingAttendanceBySession = new Map(myAttendances.map((a) => [a.trainingSessionId, a]));
      const myMatchAttendanceByMatch = new Map(myMatchAttendances.map((a) => [a.matchId, a]));
      const monthOccasions = new Map<string, { total: number; present: number }>();
      const bumpMonth = (isoDate: string, present: boolean) => {
        const key = isoDate.slice(0, 7);
        const entry = monthOccasions.get(key) ?? { total: 0, present: 0 };
        entry.total += 1;
        if (present) entry.present += 1;
        monthOccasions.set(key, entry);
      };
      for (const s of allSessions) {
        if (s.cancelled || s.date > today) continue;
        const attendance = myTrainingAttendanceBySession.get(s.id);
        const status = attendance ? effectiveStatus(attendance) : null;
        bumpMonth(s.date, status === AttendanceStatus.PRESENT);
      }
      for (const m of allMatches) {
        if (m.status !== 'PLAYED' || m.date > today) continue;
        bumpMonth(m.date, myMatchAttendanceByMatch.get(m.id)?.status === AttendanceStatus.PRESENT);
      }
      const hasMoisParfait = [...monthOccasions.values()].some(
        (e) => e.total >= MOIS_PARFAIT_MIN_OCCASIONS && e.present === e.total,
      );

      const eligibility: Record<string, boolean> = {
        first_goal: stats.goals >= 1,
        hat_trick: hasHatTrick,
        poker: hasPoker,
        fox_in_the_box: goalsByMatch.size >= 5,
        sniper: stats.goals >= 10,
        sharpshooter: stats.goals >= 20,
        goat: stats.goals >= 50,
        first_assist: stats.assists >= 1,
        playmaker: stats.assists >= 5,
        elite_passer: stats.assists >= 10,
        postman: stats.assists >= 15,
        motm_first: stats.motmCount >= 1,
        motm_hero: stats.motmCount >= 3,
        motm_legend: stats.motmCount >= 5,
        diva: stats.motmCount >= 10,
        streak_5: stats.presenceStreak >= 5,
        streak_10: stats.presenceStreak >= 10,
        streak_20: stats.presenceStreak >= 20,
        terminator: stats.presenceStreak >= 30,
        pillar: stats.trainingsPresent >= 20,
        lifetime_member: stats.trainingsPresent >= 50,
        vest_forever: stats.trainingsPresent >= 75,
        veteran: stats.matchesPlayed >= 15,
        road_captain: stats.matchesPlayed >= 30,
        centurion: stats.matchesPlayed >= 50,
        statue: stats.matchesPlayed >= 100,
        first_yellow: stats.yellowCards >= 1,
        hot_head: stats.yellowCards >= 5,
        card_collector: stats.yellowCards >= 10,
        first_red: stats.redCards >= 1,
        banned: stats.redCards >= 2,
        silent_hero: stats.matchesPlayed >= 10 && stats.goals === 0 && stats.assists === 0,
        clean_sheet: hasCleanSheet,
        roc: hasRoc,
        forteresse: hasForteresse,
        inebranlable: hasInebranlable,
        portier: hasPortier,
        super_sub: hasSuperSub,
        duo_magique: hasDuoMagique,
        porte_bonheur: maxWinStreak >= 3,
        chat_noir: maxLossStreak >= 3,
        routard: awayCount >= 5,
        beau_parleur: hasBeauParleur,
        invite_surprise: hasInviteSurprise,
        footballeur_dimanche: hasFootballeurDimanche,
        double: hasDouble,
        cadeau_anniversaire: hasBirthdayGoal,
        traiteur: hasTraiteur,
        altruiste: hasAltruiste,
        pere_noel: hasPereNoel,
        jekyll_hyde: hasJekyllHyde,
        sang_froid: hasSangFroid,
        stakhanoviste: stats.trainingsPresent >= 100,
        dernier_de_cordee: hasDernierDeCordee,
        aigle_des_surfaces: hasAigleDesSurfaces,
        specialiste: hasSpecialiste,
        impact_immediat: hasImpactImmediat,
        freres_darmes: hasFreresDarmes,
        panne_seche: hasPanneSeche,
        interimaire: hasInterimaire,
        survivant_hiver: hasSurvivantHiver,
        cadenas: hasCadenas,
        naufrage: hasNaufrage,
        incompris: hasIncompris,
        equilibriste: hasEquilibriste,
        garde_du_corps: hasGardeDuCorps,
        braquage: hasBraquage,
        mains_or: hasMainsOr,
        mains_diamant: hasMainsDiamant,
        mains_legendaires: hasMainsLegendaires,
        verrou: hasVerrou,
        veteran_defense: hasVeteranDefense,
        cadre_defensif: hasCadreDefensif,
        legende_arriere_garde: hasLegendeArriereGarde,
        patron_first: stats.patronDefenseCount >= 1,
        patron_hero: stats.patronDefenseCount >= 3,
        patron_legend: stats.patronDefenseCount >= 5,
        patron_diva: stats.patronDefenseCount >= 10,
        box_to_box: hasBoxToBox,
        fair_play: hasFairPlay,
        taulier: hasTaulier,
        historique: hasHistorique,
        mois_parfait: hasMoisParfait,
        polyvalent: hasPolyvalent,
        metronome: hasMetronome,
      };

      // Only the badges with a simple "count vs threshold" shape get a progress readout —
      // the underlying numbers already exist as local values above, this just pairs each
      // with the threshold from its own eligibility check.
      progressByKey = {
        sniper: { current: stats.goals, target: 10 },
        sharpshooter: { current: stats.goals, target: 20 },
        goat: { current: stats.goals, target: 50 },
        fox_in_the_box: { current: goalsByMatch.size, target: 5 },
        playmaker: { current: stats.assists, target: 5 },
        elite_passer: { current: stats.assists, target: 10 },
        postman: { current: stats.assists, target: 15 },
        motm_hero: { current: stats.motmCount, target: 3 },
        motm_legend: { current: stats.motmCount, target: 5 },
        diva: { current: stats.motmCount, target: 10 },
        streak_5: { current: stats.presenceStreak, target: 5 },
        streak_10: { current: stats.presenceStreak, target: 10 },
        streak_20: { current: stats.presenceStreak, target: 20 },
        terminator: { current: stats.presenceStreak, target: 30 },
        pillar: { current: stats.trainingsPresent, target: 20 },
        lifetime_member: { current: stats.trainingsPresent, target: 50 },
        vest_forever: { current: stats.trainingsPresent, target: 75 },
        stakhanoviste: { current: stats.trainingsPresent, target: 100 },
        veteran: { current: stats.matchesPlayed, target: 15 },
        road_captain: { current: stats.matchesPlayed, target: 30 },
        centurion: { current: stats.matchesPlayed, target: 50 },
        statue: { current: stats.matchesPlayed, target: 100 },
        hot_head: { current: stats.yellowCards, target: 5 },
        card_collector: { current: stats.yellowCards, target: 10 },
        banned: { current: stats.redCards, target: 2 },
        roc: { current: cleanSheetCount, target: 5 },
        forteresse: { current: cleanSheetCount, target: 10 },
        inebranlable: { current: cleanSheetCount, target: 20 },
        mains_or: { current: goalkeeperCleanSheetCount, target: 5 },
        mains_diamant: { current: goalkeeperCleanSheetCount, target: 10 },
        mains_legendaires: { current: goalkeeperCleanSheetCount, target: 20 },
        veteran_defense: { current: defenderStartCount, target: 15 },
        cadre_defensif: { current: defenderStartCount, target: 30 },
        legende_arriere_garde: { current: defenderStartCount, target: 50 },
        patron_hero: { current: stats.patronDefenseCount, target: 3 },
        patron_legend: { current: stats.patronDefenseCount, target: 5 },
        patron_diva: { current: stats.patronDefenseCount, target: 10 },
        historique: { current: seasonsActive.size, target: 3 },
      };

      const repeatableCounts: Record<string, number> = {
        hat_trick: hatTrickCount,
        poker: pokerCount,
        double: doubleCount,
        duo_magique: duoMagiqueCount,
        clean_sheet: cleanSheetCount,
        portier: goalkeeperCleanSheetCount,
        super_sub: superSubCount,
        braquage: braquageCount,
        traiteur: traiteurCount,
        cadeau_anniversaire: birthdayGoalCount,
        jekyll_hyde: jekyllHydeCount,
        impact_immediat: impactImmediatCount,
        box_to_box: boxToBoxCount,
      };
      const occurrenceCount = (key: string): number =>
        REPEATABLE_BADGE_KEYS.has(key) ? (repeatableCounts[key] ?? 0) : eligibility[key] ? 1 : 0;

      const otherCategories: BadgeCategory[] = [
        'GOALS',
        'ASSISTS',
        'MOTM',
        'ATTENDANCE',
        'EXPERIENCE',
        'DISCIPLINE',
        'IMPACT',
      ];
      eligibility.swiss_army = otherCategories.every((category) =>
        BADGE_DEFINITIONS.some((d) => d.category === category && eligibility[d.key]),
      );

      const existing = await this.badgesRepository.find({ where: { userId } });
      const existingByKey = new Map(existing.map((b) => [b.badgeKey, b]));

      const toCreate: UserBadge[] = [];
      const toUpdate: UserBadge[] = [];
      const notifications: { title: string; count: number }[] = [];

      for (const d of BADGE_DEFINITIONS) {
        const count = occurrenceCount(d.key);
        if (count <= 0) continue;
        const row = existingByKey.get(d.key);
        if (!row) {
          toCreate.push(this.badgesRepository.create({ userId, badgeKey: d.key, count }));
          notifications.push({ title: d.title, count });
        } else if (REPEATABLE_BADGE_KEYS.has(d.key) && count > row.count) {
          row.count = count;
          toUpdate.push(row);
          notifications.push({ title: d.title, count });
        }
      }

      if (toCreate.length > 0 || toUpdate.length > 0) {
        await this.badgesRepository.save([...toCreate, ...toUpdate]);
        for (const notif of notifications) {
          await this.pushNotificationsService.sendToUser(userId, {
            title: 'Badge débloqué !',
            body: notif.count > 1 ? `${notif.title} ×${notif.count}` : notif.title,
            url: '/profile',
          });
        }
      }

      const toRevoke = [...existingByKey.entries()]
        .filter(([key]) => REVOCABLE_BADGE_KEYS.has(key) && occurrenceCount(key) <= 0)
        .map(([, row]) => row.id);
      if (toRevoke.length > 0) {
        await this.badgesRepository.delete(toRevoke);
      }
    }

    const earned = await this.badgesRepository.find({ where: { userId } });
    const earnedMap = new Map(earned.map((b) => [b.badgeKey, b]));

    return BADGE_DEFINITIONS.map((d) => {
      const row = earnedMap.get(d.key);
      return {
        ...d,
        earned: !!row,
        earnedAt: row?.earnedAt ?? null,
        count: row?.count ?? 0,
        progress: progressByKey[d.key] ?? null,
      };
    });
  }

  private levelFromScore(score: number): AccountLevel {
    const sorted = [...TIER_THRESHOLDS].sort((a, b) => b.minScore - a.minScore);
    const currentIndex = sorted.findIndex((t) => score >= t.minScore);
    const current = sorted[currentIndex];
    const next = currentIndex > 0 ? sorted[currentIndex - 1] : null;

    return {
      score,
      tier: current.tier,
      nextTier: next?.tier ?? null,
      nextTierScore: next?.minScore ?? null,
    };
  }

  /** Overall account level, derived from earned badges weighted by rarity — mirrors the
   * ring shown around a player's avatar (Bronze → Silver → Gold → Platinum → Diamond → Ruby). */
  async getAccountLevel(userId: string): Promise<AccountLevel> {
    const badges = await this.getForUser(userId);
    const score = badges
      .filter((b) => b.earned)
      .reduce((sum, b) => sum + RARITY_WEIGHT[b.rarity] * b.count, 0);
    return this.levelFromScore(score);
  }

  /** Same as getAccountLevel but for every user at once — used to ring avatars across
   * the roster/match sheet without one request per player. Reads already-persisted
   * badges only (no live eligibility recompute), which is fine for a roster-wide glance. */
  async getAccountLevelsForAll(): Promise<Record<string, AccountLevel>> {
    const [users, allBadges] = await Promise.all([
      this.usersRepository.find(),
      this.badgesRepository.find(),
    ]);
    const rarityByKey = new Map(BADGE_DEFINITIONS.map((d) => [d.key, d.rarity]));
    const scoreByUser = new Map<string, number>();
    for (const b of allBadges) {
      const rarity = rarityByKey.get(b.badgeKey) ?? 'COMMON';
      scoreByUser.set(b.userId, (scoreByUser.get(b.userId) ?? 0) + RARITY_WEIGHT[rarity] * b.count);
    }

    const result: Record<string, AccountLevel> = {};
    for (const user of users) {
      result[user.id] = this.levelFromScore(scoreByUser.get(user.id) ?? 0);
    }
    return result;
  }
}
