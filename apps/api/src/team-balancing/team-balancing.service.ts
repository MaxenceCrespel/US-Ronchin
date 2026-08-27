import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TrainingTeamAssignment } from './entities/training-team-assignment.entity';
import { TrainingSession } from '../trainings/entities/training-session.entity';
import { Attendance, AttendanceStatus } from '../attendances/entities/attendance.entity';
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
    const presentAttendances = allAttendances.filter((a) => a.status === AttendanceStatus.PRESENT);
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

    // Guests ("+1"/"+2") have no skill data — spread them to keep team headcounts even instead.
    const guestAssignments: { userId: null; guestLabel: string; teamIndex: number }[] = [];
    for (const attendance of guestSourceAttendances) {
      for (let i = 0; i < attendance.guestCount; i++) {
        const guest = attendance.guests?.[i];
        const label = guest
          ? `${guest.firstName}${guest.lastName ? ` ${guest.lastName}` : ''}`
          : `Invité de ${attendance.user.firstName} #${i + 1}`;
        let minTeam = 0;
        for (let t = 1; t < effectiveTeamCount; t++) {
          if (teamCounts[t] < teamCounts[minTeam]) minTeam = t;
        }
        teamCounts[minTeam] += 1;
        guestAssignments.push({
          userId: null,
          guestLabel: label,
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
}
