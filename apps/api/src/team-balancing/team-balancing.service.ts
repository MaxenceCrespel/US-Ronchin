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
import { BAND_BY_SUBPOSITION, BANDS, bandsCovered } from './bands';
import { dealTeams, Line } from './team-deal';
import { parisToday, parisWallTimeToDate } from '../common/utils/paris-time';
import { PlayerSeparationRule } from '../users/entities/player-separation-rule.entity';
import { pointsForResult } from './points-for-result';

const DEFAULT_TEAM_COUNT = 2;

// skillScore is 0-100 — a ±1-point spread (so up to 2 points apart) is well within noise
// for a score built from recency-weighted ratings, damped confidence priors, etc. (see
// StatsService.getPlayerStats). Kept narrow on purpose: the confidence-shrink formulas
// already compress the score range compared to raw averages, so a jitter as wide as before
// would swamp real, meaningful gaps between players — this is only enough to make truly
// tied players swap places between regenerations, never to flip a genuine mismatch.
const SCORE_JITTER_RANGE = 2;

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
    @InjectRepository(PlayerSeparationRule)
    private readonly separationRulesRepository: Repository<PlayerSeparationRule>,
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

  /** Wipes the composition entirely — back to "not generated yet", distinct from
   * generateTeams which immediately replaces it with a fresh split. Coach-only, same as
   * every other team-editing action here. */
  async deleteTeams(sessionId: string): Promise<void> {
    await this.assignmentsRepository.delete({ trainingSessionId: sessionId });
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
    // Once a real pointage exists, the coach's call is authoritative and isn't second-
    // guessed by the training's max-present cap (a.confirmed) — that cap only governs the
    // self-service poll, pre-pointage.
    const presentAttendances = allAttendances.filter((a) =>
      a.actualStatus != null
        ? a.actualStatus === AttendanceStatus.PRESENT
        : a.status === AttendanceStatus.PRESENT && a.confirmed,
    );
    // confirmedGuestCount, not the raw guestCount someone declared — a guest is a headcount
    // unit against the SAME cap as the inviting player (see AttendancesService.setAttendance),
    // so an excess guest beyond the cap never makes it onto a team, same as a waitlisted
    // player. Unlike presentAttendances above, this isn't gated by pointage — guests were
    // never part of that concept, the poll-time allocation is always the source of truth.
    const guestSourceAttendances = allAttendances.filter((a) => a.confirmedGuestCount > 0);
    if (presentAttendances.length === 0 && guestSourceAttendances.length === 0) {
      throw new BadRequestException('Aucun joueur présent pour générer des équipes');
    }
    const totalHeadcount =
      presentAttendances.length +
      guestSourceAttendances.reduce((sum, a) => sum + a.confirmedGuestCount, 0);

    const playerStats = await this.statsService.getPlayerStats();
    const scoreByUserId = new Map(playerStats.map((p) => [p.userId, p.skillScore]));

    // A 45 and a 55 aren't meaningfully different players — sorting strictly by score made
    // "Régénérer" fully deterministic (same inputs → same split, every single time, since
    // nothing here uses randomness), which reads as "the button doesn't do anything" even
    // though it's actually just re-finding the one best split. Jittering the sort key lets
    // players within SCORE_JITTER_RANGE of each other swap places from one regeneration to
    // the next, so re-rolling gives a genuinely different (still fair) team split — while a
    // wide gap (e.g. 20 vs 80) is never enough for the jitter to flip. Only the processing
    // ORDER is jittered: teamSums below still accumulate the real, un-jittered score, so the
    // actual size/skill balance of the two teams is unaffected — only which of two
    // close-in-skill players ends up on which side varies.
    const jitterByUserId = new Map(
      presentAttendances.map((a) => [a.userId, (Math.random() - 0.5) * SCORE_JITTER_RANGE]),
    );
    const jitteredScore = (userId: string) =>
      (scoreByUserId.get(userId) ?? 0) + (jitterByUserId.get(userId) ?? 0);
    const presentUserIds = presentAttendances
      .map((a) => a.userId)
      .sort((a, b) => jitteredScore(b) - jitteredScore(a));

    const effectiveTeamCount = Math.min(teamCount, Math.max(2, totalHeadcount));

    // The split itself: equal headcounts first, then line by line, best player first, dealt
    // one team after the other (see dealTeams for the rules and their order of priority).
    const { teamByUserId, lineByUserId } = dealTeams(
      presentAttendances.map((a) => ({
        userId: a.userId,
        score: scoreByUserId.get(a.userId) ?? 0,
        orderKey: jitteredScore(a.userId),
        positions: a.user.positions ?? [],
      })),
      effectiveTeamCount,
    );
    const teamCounts = new Array(effectiveTeamCount).fill(0);
    const assignments: { userId: string; guestLabel: null; teamIndex: number }[] = [];
    for (const userId of presentUserIds) {
      const teamIndex = teamByUserId.get(userId)!;
      teamCounts[teamIndex] += 1;
      assignments.push({ userId, guestLabel: null, teamIndex });
    }
    const userById = new Map(presentAttendances.map((a) => [a.userId, a.user]));

    // Admin-declared "never on the same team" pairs (see PlayerSeparationRulesService) —
    // best-effort: if constraints overlap too much to all be satisfied with this many teams,
    // whichever can't be resolved safely is left as-is rather than left half-fixed.
    const separationRules = await this.separationRulesRepository.find();
    this.resolveSeparationRules(assignments, separationRules, scoreByUserId, effectiveTeamCount, lineByUserId);

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
      for (let i = 0; i < attendance.confirmedGuestCount; i++) {
        const guest = attendance.guests?.[i];
        const label = guest
          ? `${guest.firstName}${guest.lastName ? ` ${guest.lastName}` : ''}`
          : `Invité de ${attendance.user.firstName} #${i + 1}`;
        const band = guest?.position ? BAND_BY_SUBPOSITION[guest.position] : null;

        // Headcount always comes first, exactly like the real players above: only the teams
        // tied for the CURRENT lowest headcount are candidates, and a declared position only
        // chooses among those. Letting the position decide on its own (headcount as a mere
        // tie-break) could stack several positioned guests onto one team — with 13 players and
        // 3 guests it produced 9 against 7 — since each guest looks at its own band only.
        const minCount = Math.min(...teamCounts);
        const candidates: number[] = [];
        for (let t = 0; t < effectiveTeamCount; t++) {
          if (teamCounts[t] === minCount) candidates.push(t);
        }
        let minTeam = candidates[0];
        if (band) {
          const coverage = bandCoverageByTeam.get(band)!;
          for (const t of candidates) {
            if (coverage[t] < coverage[minTeam]) minTeam = t;
          }
          coverage[minTeam] += 1;
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
    // scheduler's auto-generation (1h30 before kickoff) and a coach re-generating by hand.
    await this.pushNotificationsService.sendToUsers(presentUserIds, {
      title: 'Équipes prêtes !',
      body: `Les équipes sont faites pour l'entraînement du ${session.date} — viens voir la tienne.`,
      url: `/trainings?session=${sessionId}`,
    });

    return this.getTeams(sessionId);
  }

  /** Mutates assignments in place, swapping one member of a violating pair to another team
   * whenever two admin-separated players land together — picks whichever legal swap partner
   * has the closest skill score — within the mover's own line when there is one — to minimize
   * balance disruption. "Legal" is checked in BOTH
   * directions: pulling the candidate onto the staying player's team must not recreate a
   * different violation there, AND pushing the mover onto the candidate's team must not
   * recreate a different violation there either — e.g. someone excluded from two other
   * players (a "triangle") can't be shuffled onto whichever team already holds the other
   * one. If moving the rule's second player is boxed in that way, the first player is tried
   * instead; if neither can move safely, the pair is left as-is — this never throws or
   * blocks team generation. */
  private resolveSeparationRules(
    assignments: { userId: string; teamIndex: number }[],
    rules: { userAId: string; userBId: string }[],
    scoreByUserId: Map<string, number | null>,
    teamCount: number,
    lineByUserId: Map<string, Line> = new Map(),
  ): void {
    if (rules.length === 0 || teamCount < 2) return;
    const assignmentByUserId = new Map(assignments.map((a) => [a.userId, a]));

    // Would `personId` sitting on `team` conflict, under some rule other than the one
    // currently being resolved, with whoever else is already assigned there?
    const conflictsOnTeam = (
      personId: string,
      team: number,
      ignoreRule: { userAId: string; userBId: string },
    ): boolean =>
      rules.some((r) => {
        if (r === ignoreRule) return false;
        const partnerId = r.userAId === personId ? r.userBId : r.userBId === personId ? r.userAId : null;
        if (!partnerId || partnerId === personId) return false;
        return assignmentByUserId.get(partnerId)?.teamIndex === team;
      });

    // Looks for the closest-skill candidate elsewhere who can swap places with `mover`
    // without recreating a different violation on either side, and applies it. Returns
    // whether a swap was made.
    const trySwap = (
      mover: { userId: string; teamIndex: number },
      staying: { userId: string; teamIndex: number },
      rule: { userAId: string; userBId: string },
    ): boolean => {
      let bestCandidate: { userId: string; teamIndex: number } | null = null;
      let bestDiff = Infinity;
      for (const candidate of assignments) {
        if (candidate.teamIndex === staying.teamIndex || candidate.userId === mover.userId) continue;
        if (
          conflictsOnTeam(candidate.userId, staying.teamIndex, rule) ||
          conflictsOnTeam(mover.userId, candidate.teamIndex, rule)
        ) {
          continue;
        }
        // Someone from the SAME line first (a forward for a forward keeps the line-by-line split
        // intact), and only then whoever is closest in score.
        const sameLine = lineByUserId.get(candidate.userId) === lineByUserId.get(mover.userId) ? 0 : 1;
        const diff =
          sameLine * 1000 +
          Math.abs((scoreByUserId.get(candidate.userId) ?? 0) - (scoreByUserId.get(mover.userId) ?? 0));
        if (diff < bestDiff) {
          bestDiff = diff;
          bestCandidate = candidate;
        }
      }
      if (!bestCandidate) return false;
      const targetTeam = bestCandidate.teamIndex;
      bestCandidate.teamIndex = staying.teamIndex;
      mover.teamIndex = targetTeam;
      return true;
    };

    for (const rule of rules) {
      const a = assignmentByUserId.get(rule.userAId);
      const b = assignmentByUserId.get(rule.userBId);
      // One or both absent from this session, or already on different teams — nothing to do.
      if (!a || !b || a.teamIndex !== b.teamIndex) continue;

      if (!trySwap(b, a, rule)) trySwap(a, b, rule);
      // else: neither direction had a safe swap this round — best-effort, move on rather
      // than block generation.
    }
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

  /** Drops one assignment from the team — a guest who ends up not coming, or a player who
   * said "Présent" but isn't actually there. Deliberately leaves the player's declared
   * `status` untouched: this is about who's on the pitch right now, not a correction to
   * their declaration — they said they'd come and didn't, which is exactly what the "Beau
   * Parleur" badge rewards catching (declared PRESENT, actual ABSENT) once pointage réel
   * confirms it. Overwriting `status` here would erase that mismatch before it's ever
   * recorded. Instead, this sets `actualStatus` to ABSENT — effectively an early, one-person
   * pointage réel, recorded the moment the coach notices — which both keeps the mismatch
   * intact for the badge AND, critically, is what generateTeams' presentAttendances filter
   * checks first: without it, a straight "Régénérer" right after would read the still-PRESENT
   * `status`, find nothing telling it otherwise, and put the very person just removed right
   * back on a team. For a guest (no actualStatus to set), cleans up the source
   * AttendanceGuest and decrements confirmedGuestCount too — not just guestCount — since
   * that's what generateTeams' guest loop actually counts against.
   * confirmFinalTeams (the post-training reconciliation) reads the same actualStatus, so a
   * removal made here needs no separate handling once the session's over — it already
   * looks exactly like a real no-show. */
  async removeFromTeam(
    sessionId: string,
    assignmentId: string,
  ): Promise<TrainingTeamAssignment[]> {
    const assignment = await this.assignmentsRepository.findOne({
      where: { id: assignmentId, trainingSessionId: sessionId },
    });
    if (!assignment) {
      throw new NotFoundException('Affectation introuvable');
    }

    await this.assignmentsRepository.delete(assignment.id);

    if (assignment.userId) {
      await this.attendancesRepository.update(
        { trainingSessionId: sessionId, userId: assignment.userId },
        { actualStatus: AttendanceStatus.ABSENT },
      );
    }

    if (assignment.attendanceGuestId) {
      const guest = await this.attendanceGuestsRepository.findOne({
        where: { id: assignment.attendanceGuestId },
      });
      if (guest) {
        await this.attendanceGuestsRepository.delete(guest.id);
        await this.attendancesRepository.decrement({ id: guest.attendanceId }, 'guestCount', 1);
        await this.attendancesRepository.decrement(
          { id: guest.attendanceId },
          'confirmedGuestCount',
          1,
        );
      }
    }

    return this.getTeams(sessionId);
  }

  /** Coach force-adds a specific roster player who never responded (or declared something
   * else) straight onto a team — the flip side of removeFromTeam. Marks them PRESENT (the
   * coach placing them on a team already says as much — same meaning as if they'd ticked it
   * themselves) and drops them on whichever team is currently smallest, same placement rule
   * as a last-minute arrival in confirmFinalTeams. Requires teams to already exist: this
   * is a one-off correction to an existing split, not a way to build one from scratch. */
  async addPlayerToTeam(sessionId: string, userId: string): Promise<TrainingTeamAssignment[]> {
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
    if (existingAssignments.some((a) => a.userId === userId)) {
      throw new BadRequestException('Ce joueur est déjà dans une équipe.');
    }

    let attendance = await this.attendancesRepository.findOne({
      where: { trainingSessionId: sessionId, userId },
    });
    if (attendance) {
      attendance.status = AttendanceStatus.PRESENT;
      attendance.respondedAt = new Date();
    } else {
      attendance = this.attendancesRepository.create({
        trainingSessionId: sessionId,
        userId,
        status: AttendanceStatus.PRESENT,
        respondedAt: new Date(),
      });
    }
    await this.attendancesRepository.save(attendance);

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

    await this.assignmentsRepository.save(
      this.assignmentsRepository.create({
        trainingSessionId: sessionId,
        userId,
        guestLabel: null,
        teamIndex: minTeam,
      }),
    );

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
    const today = parisToday();

    const candidateSessions = await this.sessionsRepository.find({
      where: { date: today, cancelled: false },
    });

    const sessionsNeedingTeams: TrainingSession[] = [];
    for (const session of candidateSessions) {
      const sessionDateTime = parisWallTimeToDate(session.date, session.startTime);
      const diffMinutes = (sessionDateTime.getTime() - now.getTime()) / 60000;
      // A single-minute window (diffMinutes > 89 && <= 90) meant one missed cron tick —
      // an API restart/deploy right at that moment, most often — permanently skipped the
      // session, since the window would never come back around. Widen it into a catch-up
      // range instead: fire any time from 1h30 out through 3 hours after kickoff,
      // relying on the alreadyGenerated check below for idempotency rather than exact timing.
      if (diffMinutes <= 90 && diffMinutes > -180) {
        const alreadyGenerated = await this.hasTeams(session.id);
        if (!alreadyGenerated) {
          sessionsNeedingTeams.push(session);
        }
      }
    }
    return sessionsNeedingTeams;
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
      pointsBySessionTeam.set(session.id, pointsForResult(session.scoreTeam0!, session.scoreTeam1!));
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

  /** Every training session a given player has any record of — attendance (declared vs.
   * the coach's real pointage) and which team/score/points, most recent first. Built for
   * untangling a "my points look wrong" dispute (wrong team assigned, a score that never
   * got entered...) without a one-off SQL query each time — same underlying data as
   * getTrainingRanking, just per-player and un-aggregated. Admin-only, see the controller. */
  async getPlayerTrainingHistory(userId: string): Promise<PlayerTrainingHistoryEntry[]> {
    const [sessions, attendances, assignments] = await Promise.all([
      this.sessionsRepository.find({ order: { date: 'DESC' } }),
      this.attendancesRepository.find({ where: { userId } }),
      this.assignmentsRepository.find({ where: { userId } }),
    ]);
    const attendanceBySessionId = new Map(attendances.map((a) => [a.trainingSessionId, a]));
    const assignmentBySessionId = new Map(assignments.map((a) => [a.trainingSessionId, a]));

    const entries: PlayerTrainingHistoryEntry[] = [];
    for (const session of sessions) {
      const attendance = attendanceBySessionId.get(session.id);
      const assignment = assignmentBySessionId.get(session.id);
      // Nothing at all on record for this player at this session — skip rather than pad
      // the history with rows that say nothing (never invited, joined after the fact...).
      if (!attendance && !assignment) continue;

      let points: number | null = null;
      if (assignment && session.scoreTeam0 != null && session.scoreTeam1 != null) {
        points = pointsForResult(session.scoreTeam0, session.scoreTeam1)[assignment.teamIndex] ?? 0;
      }

      entries.push({
        sessionId: session.id,
        date: session.date,
        cancelled: session.cancelled,
        declaredStatus: attendance?.status ?? null,
        actualStatus: attendance?.actualStatus ?? null,
        teamIndex: assignment?.teamIndex ?? null,
        scoreTeam0: session.scoreTeam0,
        scoreTeam1: session.scoreTeam1,
        points,
      });
    }
    return entries;
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

export interface PlayerTrainingHistoryEntry {
  sessionId: string;
  date: string;
  cancelled: boolean;
  declaredStatus: AttendanceStatus | null;
  actualStatus: AttendanceStatus | null;
  teamIndex: number | null;
  scoreTeam0: number | null;
  scoreTeam1: number | null;
  /** Null when unscored, or no team was ever assigned (never played that session). */
  points: number | null;
}
