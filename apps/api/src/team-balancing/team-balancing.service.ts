import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { TrainingTeamAssignment } from './entities/training-team-assignment.entity';
import { TrainingSession } from '../trainings/entities/training-session.entity';
import { Attendance, AttendanceStatus } from '../attendances/entities/attendance.entity';
import { AttendanceGuest } from '../attendances/entities/attendance-guest.entity';
import { StatsService } from '../stats/stats.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { PlayerPosition, PlayerSubPosition, User } from '../users/entities/user.entity';

const DEFAULT_TEAM_COUNT = 2;

const BAND_BY_SUBPOSITION: Record<PlayerSubPosition, PlayerPosition> = {
  [PlayerSubPosition.GOALKEEPER]: PlayerPosition.GOALKEEPER,
  [PlayerSubPosition.CENTER_BACK]: PlayerPosition.DEFENDER,
  [PlayerSubPosition.RIGHT_BACK]: PlayerPosition.DEFENDER,
  [PlayerSubPosition.LEFT_BACK]: PlayerPosition.DEFENDER,
  [PlayerSubPosition.DEFENSIVE_MIDFIELDER]: PlayerPosition.MIDFIELDER,
  [PlayerSubPosition.CENTER_MIDFIELDER]: PlayerPosition.MIDFIELDER,
  [PlayerSubPosition.RIGHT_MIDFIELDER]: PlayerPosition.MIDFIELDER,
  [PlayerSubPosition.LEFT_MIDFIELDER]: PlayerPosition.MIDFIELDER,
  [PlayerSubPosition.ATTACKING_MIDFIELDER]: PlayerPosition.MIDFIELDER,
  [PlayerSubPosition.RIGHT_WINGER]: PlayerPosition.FORWARD,
  [PlayerSubPosition.LEFT_WINGER]: PlayerPosition.FORWARD,
  [PlayerSubPosition.STRIKER]: PlayerPosition.FORWARD,
};

const BANDS: PlayerPosition[] = [
  PlayerPosition.GOALKEEPER,
  PlayerPosition.DEFENDER,
  PlayerPosition.MIDFIELDER,
  PlayerPosition.FORWARD,
];

/** A player "covers" a band as soon as ANY of their selected positions maps to it —
 * a defender who also plays midfield can count as midfield cover if a team needs one. */
function bandsCovered(user: User): Set<PlayerPosition> {
  return new Set((user.positions ?? []).map((p) => BAND_BY_SUBPOSITION[p]));
}

@Injectable()
export class TeamBalancingService {
  constructor(
    @InjectRepository(TrainingTeamAssignment)
    private readonly assignmentsRepository: Repository<TrainingTeamAssignment>,
    @InjectRepository(TrainingSession)
    private readonly sessionsRepository: Repository<TrainingSession>,
    @InjectRepository(Attendance)
    private readonly attendancesRepository: Repository<Attendance>,
    @InjectRepository(AttendanceGuest)
    private readonly attendanceGuestsRepository: Repository<AttendanceGuest>,
    private readonly statsService: StatsService,
    private readonly pushNotificationsService: PushNotificationsService,
  ) {}

  getTeams(sessionId: string): Promise<TrainingTeamAssignment[]> {
    return this.assignmentsRepository.find({
      where: { trainingSessionId: sessionId },
      relations: { user: true },
      order: { teamIndex: 'ASC' },
    });
  }

  async hasTeams(sessionId: string): Promise<boolean> {
    const count = await this.assignmentsRepository.count({
      where: { trainingSessionId: sessionId },
    });
    return count > 0;
  }

  async generateTeams(
    sessionId: string,
    teamCount: number = DEFAULT_TEAM_COUNT,
  ): Promise<TrainingTeamAssignment[]> {
    const session = await this.sessionsRepository.findOne({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException('Séance introuvable');
    }

    // A guest can still show up even if whoever registered them ends up Absent/Incertain
    // themselves — so guests are pulled from every attendance row for this session, not
    // just the PRESENT ones. Real player assignment below still only ever uses
    // presentAttendances.
    const allAttendances = await this.attendancesRepository.find({
      where: { trainingSessionId: sessionId },
      relations: { user: true, guests: true },
    });
    // Prefers the coach's post-training "pointage réel" (actualStatus) over the pre-session
    // declared status once it's been recorded — otherwise a coach correcting who actually
    // showed up had no way to make "Régénérer" reflect it, and the training ranking (built
    // from these same assignments) kept crediting/blaming whoever merely *declared*
    // PRESENT. Before the pointage happens, actualStatus is null for everyone and this
    // falls back to the declared status exactly as before — the normal pre-kickoff path.
    const presentAttendances = allAttendances.filter(
      (a) => (a.actualStatus ?? a.status) === AttendanceStatus.PRESENT,
    );
    const guestSourceAttendances = allAttendances.filter((a) => a.guestCount > 0);
    if (presentAttendances.length === 0 && guestSourceAttendances.length === 0) {
      throw new BadRequestException('Aucun joueur présent pour générer des équipes');
    }
    const totalHeadcount =
      presentAttendances.length + guestSourceAttendances.reduce((sum, a) => sum + a.guestCount, 0);

    const playerStats = await this.statsService.getPlayerStats();
    const scoreByUserId = new Map(playerStats.map((p) => [p.userId, p.skillScore]));

    const presentUserIds = presentAttendances
      .map((a) => a.userId)
      .sort((a, b) => (scoreByUserId.get(b) ?? 0) - (scoreByUserId.get(a) ?? 0));

    const effectiveTeamCount = Math.min(teamCount, Math.max(2, totalHeadcount));
    const teamSums = new Array(effectiveTeamCount).fill(0);
    const teamCounts = new Array(effectiveTeamCount).fill(0);
    const assignments: { userId: string; guestLabel: null; teamIndex: number }[] = [];

    // Real players first, balanced by skill score.
    for (const userId of presentUserIds) {
      let minTeam = 0;
      for (let i = 1; i < effectiveTeamCount; i++) {
        if (teamSums[i] < teamSums[minTeam]) minTeam = i;
      }
      teamSums[minTeam] += scoreByUserId.get(userId) ?? 0;
      teamCounts[minTeam] += 1;
      assignments.push({ userId, guestLabel: null, teamIndex: minTeam });
    }

    // Safety net: if a whole team ends up with zero coverage on a broad position band
    // (goalkeeper/defense/midfield/attack) while another team has a spare, swap one player
    // in — best-effort only, does not attempt full multi-band optimization.
    const userById = new Map(presentAttendances.map((a) => [a.userId, a.user]));
    for (const band of BANDS) {
      const coverers = presentUserIds.filter((id) => bandsCovered(userById.get(id)!).has(band));
      if (coverers.length === 0) continue;

      const coverageByTeam = new Array(effectiveTeamCount).fill(0);
      for (const id of coverers) {
        const assignment = assignments.find((a) => a.userId === id)!;
        coverageByTeam[assignment.teamIndex]++;
      }

      for (let emptyTeam = 0; emptyTeam < effectiveTeamCount; emptyTeam++) {
        if (coverageByTeam[emptyTeam] > 0) continue;

        const donorTeam = coverageByTeam.findIndex((c, i) => i !== emptyTeam && c >= 2);
        if (donorTeam === -1) continue;

        const moverId = coverers.find(
          (id) => assignments.find((a) => a.userId === id)!.teamIndex === donorTeam,
        );
        if (!moverId) continue;
        const moverScore = scoreByUserId.get(moverId) ?? 0;

        const emptyTeamMembers = assignments.filter((a) => a.teamIndex === emptyTeam);
        if (emptyTeamMembers.length === 0) continue;
        const partner = emptyTeamMembers.reduce((closest, candidate) => {
          const candidateScore = scoreByUserId.get(candidate.userId) ?? 0;
          const closestScore = scoreByUserId.get(closest.userId) ?? 0;
          return Math.abs(candidateScore - moverScore) < Math.abs(closestScore - moverScore)
            ? candidate
            : closest;
        });

        const moverAssignment = assignments.find((a) => a.userId === moverId)!;
        moverAssignment.teamIndex = emptyTeam;
        partner.teamIndex = donorTeam;
        coverageByTeam[donorTeam]--;
        coverageByTeam[emptyTeam]++;
      }
    }

    // Guests ("+1"/"+2") have no skill score — spread by headcount as a default. But when a
    // guest's position was specified, prefer whichever team is thinnest on that band (real
    // players + guests already placed this pass) instead — a declared goalkeeper guest is
    // more useful going to the team with no goalkeeper than to whichever has one fewer body.
    const bandCoverageByTeam = new Map<PlayerPosition, number[]>();
    for (const band of BANDS) {
      const counts = new Array(effectiveTeamCount).fill(0);
      for (const id of presentUserIds) {
        if (bandsCovered(userById.get(id)!).has(band)) {
          const a = assignments.find((x) => x.userId === id);
          if (a) counts[a.teamIndex]++;
        }
      }
      bandCoverageByTeam.set(band, counts);
    }

    const guestAssignments: {
      userId: null;
      guestLabel: string;
      guestPosition: PlayerSubPosition | null;
      attendanceGuestId: string | null;
      teamIndex: number;
    }[] = [];
    for (const attendance of guestSourceAttendances) {
      for (let i = 0; i < attendance.guestCount; i++) {
        const guest = attendance.guests?.[i];
        const label = guest
          ? `${guest.firstName}${guest.lastName ? ` ${guest.lastName}` : ''}`
          : `Invité de ${attendance.user.firstName} #${i + 1}`;
        const band = guest?.position ? BAND_BY_SUBPOSITION[guest.position] : null;

        let minTeam = 0;
        if (band) {
          const coverage = bandCoverageByTeam.get(band)!;
          for (let t = 1; t < effectiveTeamCount; t++) {
            if (
              coverage[t] < coverage[minTeam] ||
              (coverage[t] === coverage[minTeam] && teamCounts[t] < teamCounts[minTeam])
            ) {
              minTeam = t;
            }
          }
          coverage[minTeam] += 1;
        } else {
          for (let t = 1; t < effectiveTeamCount; t++) {
            if (teamCounts[t] < teamCounts[minTeam]) minTeam = t;
          }
        }
        teamCounts[minTeam] += 1;
        guestAssignments.push({
          userId: null,
          guestLabel: label,
          guestPosition: guest?.position ?? null,
          attendanceGuestId: guest?.id ?? null,
          teamIndex: minTeam,
        });
      }
    }

    await this.assignmentsRepository.delete({ trainingSessionId: sessionId });
    const entities = [...assignments, ...guestAssignments].map((a) =>
      this.assignmentsRepository.create({ trainingSessionId: sessionId, ...a }),
    );
    await this.assignmentsRepository.save(entities);

    // Invite everyone present to come see which team they landed on — covers both the
    // scheduler's auto-generation (30 min before kickoff) and a coach re-generating by hand.
    await this.pushNotificationsService.sendToUsers(presentUserIds, {
      title: 'Équipes prêtes !',
      body: `Les équipes sont faites pour l'entraînement du ${session.date} — viens voir la tienne.`,
      url: `/trainings?session=${sessionId}`,
    });

    return this.getTeams(sessionId);
  }

  /** Post-training reconciliation, distinct from generateTeams: the pre-training
   * "Générer"/"Régénérer" fully re-balances by skill from scratch, which is right before
   * kickoff but wrong afterwards — the match was already played with whoever actually
   * showed up, and a full reshuffle would scramble that real split. This only removes
   * no-shows ("faux plan" — declared present, actually absent) and adds anyone who showed
   * up without having been on the original list ("présent de dernière minute"), leaving
   * everyone else's team untouched. Coach calls this from the pointage réel dialog once
   * attendance is confirmed, so the final roster (and the ranking built from it) matches
   * who was really there. */
  async confirmFinalTeams(sessionId: string): Promise<TrainingTeamAssignment[]> {
    const session = await this.sessionsRepository.findOne({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException('Séance introuvable');
    }

    const existingAssignments = await this.assignmentsRepository.find({
      where: { trainingSessionId: sessionId },
    });
    if (existingAssignments.length === 0) {
      throw new BadRequestException(
        "Aucune équipe générée pour cette séance — génère-les d'abord.",
      );
    }
    // An entirely empty team (e.g. only one real player generated, spread across the usual
    // 2 teams) has no assignment rows at all, so it'd be invisible to a max(teamIndex)
    // derivation — floor at DEFAULT_TEAM_COUNT so a newcomer can still land there.
    const teamCount = Math.max(
      DEFAULT_TEAM_COUNT,
      Math.max(...existingAssignments.map((a) => a.teamIndex)) + 1,
    );

    const allAttendances = await this.attendancesRepository.find({
      where: { trainingSessionId: sessionId },
    });
    const effectivePresentUserIds = new Set(
      allAttendances
        .filter((a) => (a.actualStatus ?? a.status) === AttendanceStatus.PRESENT)
        .map((a) => a.userId),
    );

    // No-shows: real-player slots (never guest slots — a guest can still have shown up
    // even if whoever invited them is marked absent for real) whose effective status
    // isn't PRESENT any more.
    const noShows = existingAssignments.filter(
      (a) => a.userId && !effectivePresentUserIds.has(a.userId),
    );
    if (noShows.length > 0) {
      await this.assignmentsRepository.delete(noShows.map((a) => a.id));
    }

    const remaining = existingAssignments.filter((a) => !noShows.includes(a));
    const teamCounts = new Array(teamCount).fill(0);
    for (const a of remaining) teamCounts[a.teamIndex]++;

    // Last-minute arrivals: effectively present but not on any team yet — spread across
    // teams by current headcount, same treatment as a guest, since there's no reliable
    // skill-balance reason to prefer one team over another for someone added after kickoff.
    const currentUserIds = new Set(remaining.filter((a) => a.userId).map((a) => a.userId));
    const newcomerIds = [...effectivePresentUserIds].filter((id) => !currentUserIds.has(id));
    if (newcomerIds.length > 0) {
      const newAssignments = newcomerIds.map((userId) => {
        let minTeam = 0;
        for (let i = 1; i < teamCount; i++) {
          if (teamCounts[i] < teamCounts[minTeam]) minTeam = i;
        }
        teamCounts[minTeam] += 1;
        return this.assignmentsRepository.create({
          trainingSessionId: sessionId,
          userId,
          guestLabel: null,
          teamIndex: minTeam,
        });
      });
      await this.assignmentsRepository.save(newAssignments);
    }

    return this.getTeams(sessionId);
  }

  /** Coach adds someone who showed up without being on the original list at all — no app
   * account (so they can't declare PRESENT themselves) and nobody registered them as a
   * guest either. Added straight onto a team, not routed through Attendance/AttendanceGuest
   * (which are inherently "a real player" / "a named +1 THIS PLAYER brings") — a walk-in
   * belongs to no one in particular, just the session. Placed on whichever team has the
   * fewest people, same treatment as a last-minute real-player arrival in confirmFinalTeams. */
  async addWalkIn(
    sessionId: string,
    input: { firstName: string; lastName?: string; position?: PlayerSubPosition },
  ): Promise<TrainingTeamAssignment[]> {
    const session = await this.sessionsRepository.findOne({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException('Séance introuvable');
    }

    const existingAssignments = await this.assignmentsRepository.find({
      where: { trainingSessionId: sessionId },
    });
    if (existingAssignments.length === 0) {
      throw new BadRequestException(
        "Aucune équipe générée pour cette séance — génère-les d'abord.",
      );
    }
    // Same empty-team floor as confirmFinalTeams above — an entirely empty team has no
    // assignment rows to derive its existence from.
    const teamCount = Math.max(
      DEFAULT_TEAM_COUNT,
      Math.max(...existingAssignments.map((a) => a.teamIndex)) + 1,
    );
    const teamCounts = new Array(teamCount).fill(0);
    for (const a of existingAssignments) teamCounts[a.teamIndex]++;

    let minTeam = 0;
    for (let i = 1; i < teamCount; i++) {
      if (teamCounts[i] < teamCounts[minTeam]) minTeam = i;
    }

    const label = `${input.firstName}${input.lastName ? ` ${input.lastName}` : ''}`;
    await this.assignmentsRepository.save(
      this.assignmentsRepository.create({
        trainingSessionId: sessionId,
        userId: null,
        guestLabel: label,
        guestPosition: input.position ?? null,
        attendanceGuestId: null,
        teamIndex: minTeam,
      }),
    );

    return this.getTeams(sessionId);
  }

  /** Coach removes one specific guest from a team — e.g. they said they'd bring a +1 who
   * ends up not coming. Deletes the team slot immediately (unlike a real player's "retirer",
   * which only flips their status and waits for the next Régénérer/Confirmer) and cleans up
   * the source AttendanceGuest so a later regeneration doesn't just recreate the slot. */
  async removeGuestFromTeam(
    sessionId: string,
    assignmentId: string,
  ): Promise<TrainingTeamAssignment[]> {
    const assignment = await this.assignmentsRepository.findOne({
      where: { id: assignmentId, trainingSessionId: sessionId },
    });
    if (!assignment) {
      throw new NotFoundException('Affectation introuvable');
    }
    if (assignment.userId) {
      throw new BadRequestException(
        "Ce n'est pas un invité — utilise le pointage réel pour un joueur.",
      );
    }

    await this.assignmentsRepository.delete(assignment.id);

    if (assignment.attendanceGuestId) {
      const guest = await this.attendanceGuestsRepository.findOne({
        where: { id: assignment.attendanceGuestId },
      });
      if (guest) {
        await this.attendanceGuestsRepository.delete(guest.id);
        await this.attendancesRepository.decrement(
          { id: guest.attendanceId },
          'guestCount',
          1,
        );
      }
    }

    return this.getTeams(sessionId);
  }

  /** Someone who trained as an unlinked guest before creating their own account (e.g. a
   * teammate added them by name on Tuesday and Thursday; they only install the app Friday)
   * — surfaces every past guest slot whose name matches, across every session, so the coach
   * can retroactively credit them in one go instead of hunting session by session. Exact,
   * case/accent-insensitive match only — deliberately not fuzzy, a wrong auto-link would
   * misattribute someone else's training history. */
  async findUnlinkedGuestMatches(
    firstName: string,
    lastName: string,
  ): Promise<{ assignmentId: string; sessionId: string; sessionDate: string; guestLabel: string }[]> {
    const normalize = (s: string) =>
      s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
    const target = normalize(`${firstName} ${lastName}`);

    const candidates = await this.assignmentsRepository
      .createQueryBuilder('assignment')
      .innerJoinAndSelect('assignment.trainingSession', 'session')
      .where('assignment.user_id IS NULL')
      .andWhere('assignment.guest_label IS NOT NULL')
      .orderBy('session.date', 'DESC')
      .getMany();

    return candidates
      .filter((a) => normalize(a.guestLabel!) === target)
      .map((a) => ({
        assignmentId: a.id,
        sessionId: a.trainingSessionId,
        sessionDate: a.trainingSession.date,
        guestLabel: a.guestLabel!,
      }));
  }

  /** Links the chosen past guest slots to the given account — each becomes a real-player
   * assignment, so it now counts for that player's training ranking/history. Silently skips
   * a slot that no longer matches (already linked, deleted) or would collide with an
   * existing real assignment for this user in that session, rather than failing the whole
   * batch over one stale entry. */
  async linkPastGuestTrainings(userId: string, assignmentIds: string[]): Promise<number> {
    if (assignmentIds.length === 0) return 0;

    const assignments = await this.assignmentsRepository.find({
      where: { id: In(assignmentIds) },
    });

    let linkedCount = 0;
    for (const assignment of assignments) {
      if (assignment.userId || !assignment.guestLabel) continue;

      const collision = await this.assignmentsRepository.findOne({
        where: { trainingSessionId: assignment.trainingSessionId, userId },
      });
      if (collision) continue;

      assignment.userId = userId;
      assignment.guestLabel = null;
      assignment.guestPosition = null;
      assignment.attendanceGuestId = null;
      await this.assignmentsRepository.save(assignment);
      linkedCount += 1;
    }

    return linkedCount;
  }

  async moveAssignment(
    sessionId: string,
    assignmentId: string,
    teamIndex: number,
  ): Promise<TrainingTeamAssignment[]> {
    const assignment = await this.assignmentsRepository.findOne({
      where: { id: assignmentId, trainingSessionId: sessionId },
    });
    if (!assignment) {
      throw new NotFoundException('Affectation introuvable');
    }
    assignment.teamIndex = teamIndex;
    await this.assignmentsRepository.save(assignment);
    return this.getTeams(sessionId);
  }

  async findUpcomingSessionsNeedingTeams(): Promise<TrainingSession[]> {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    const candidateSessions = await this.sessionsRepository.find({
      where: { date: today, cancelled: false },
    });

    const sessionsNeedingTeams: TrainingSession[] = [];
    for (const session of candidateSessions) {
      const sessionDateTime = new Date(`${session.date}T${session.startTime}`);
      const diffMinutes = (sessionDateTime.getTime() - now.getTime()) / 60000;
      // A single-minute window (diffMinutes > 29 && <= 30) meant one missed cron tick —
      // an API restart/deploy right at that moment, most often — permanently skipped the
      // session, since the window would never come back around. Widen it into a catch-up
      // range instead: fire any time from 30 minutes out through 3 hours after kickoff,
      // relying on the alreadyGenerated check below for idempotency rather than exact timing.
      if (diffMinutes <= 30 && diffMinutes > -180) {
        const alreadyGenerated = await this.hasTeams(session.id);
        if (!alreadyGenerated) {
          sessionsNeedingTeams.push(session);
        }
      }
    }
    return sessionsNeedingTeams;
  }

  /** Points for one team in a scrimmage: 3 for winning + the goal difference as a bonus
   * (capped at 5, so a blowout doesn't swing the season on one session), 1 each on a draw,
   * 0 for the losing team. */
  private static pointsForResult(scoreTeam0: number, scoreTeam1: number): [number, number] {
    if (scoreTeam0 === scoreTeam1) return [1, 1];
    const bonus = Math.min(Math.abs(scoreTeam0 - scoreTeam1), 5);
    const winnerPoints = 3 + bonus;
    return scoreTeam0 > scoreTeam1 ? [winnerPoints, 0] : [0, winnerPoints];
  }

  /** Cumulative "classement" from every scrimmage score entered so far — only real
   * accounts earn points (a guest has no profile to credit), and only sessions with both
   * scores filled in count. */
  async getTrainingRanking(): Promise<TrainingRankingEntry[]> {
    const scoredSessions = await this.sessionsRepository
      .createQueryBuilder('session')
      .where('session.score_team0 IS NOT NULL AND session.score_team1 IS NOT NULL')
      .getMany();
    if (scoredSessions.length === 0) return [];

    const pointsBySessionTeam = new Map<string, [number, number]>();
    for (const session of scoredSessions) {
      pointsBySessionTeam.set(
        session.id,
        TeamBalancingService.pointsForResult(session.scoreTeam0!, session.scoreTeam1!),
      );
    }

    const assignments = await this.assignmentsRepository.find({
      where: { trainingSessionId: In(scoredSessions.map((s) => s.id)) },
      relations: { user: true },
    });

    const entryByUserId = new Map<string, TrainingRankingEntry>();
    for (const assignment of assignments) {
      if (!assignment.userId || !assignment.user) continue; // guests earn nothing
      const teamPoints = pointsBySessionTeam.get(assignment.trainingSessionId);
      if (!teamPoints) continue;
      const points = teamPoints[assignment.teamIndex] ?? 0;

      const entry = entryByUserId.get(assignment.userId) ?? {
        userId: assignment.userId,
        firstName: assignment.user.firstName,
        lastName: assignment.user.lastName,
        points: 0,
        sessionsPlayed: 0,
        wins: 0,
        draws: 0,
        losses: 0,
      };
      entry.sessionsPlayed += 1;
      entry.points += points;
      if (points >= 3) entry.wins += 1;
      else if (points === 1) entry.draws += 1;
      else entry.losses += 1;
      entryByUserId.set(assignment.userId, entry);
    }

    return [...entryByUserId.values()].sort((a, b) => b.points - a.points);
  }
}

export interface TrainingRankingEntry {
  userId: string;
  firstName: string;
  lastName: string;
  points: number;
  sessionsPlayed: number;
  wins: number;
  draws: number;
  losses: number;
}
