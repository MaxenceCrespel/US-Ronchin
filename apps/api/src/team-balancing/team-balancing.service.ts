import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TrainingTeamAssignment } from './entities/training-team-assignment.entity';
import { TrainingSession } from '../trainings/entities/training-session.entity';
import { Attendance, AttendanceStatus } from '../attendances/entities/attendance.entity';
import { StatsService } from '../stats/stats.service';

const DEFAULT_TEAM_COUNT = 2;

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

    const presentAttendances = await this.attendancesRepository.find({
      where: { trainingSessionId: sessionId, status: AttendanceStatus.PRESENT },
      relations: { user: true },
    });
    if (presentAttendances.length === 0) {
      throw new BadRequestException('Aucun joueur présent pour générer des équipes');
    }
    const totalHeadcount = presentAttendances.reduce((sum, a) => sum + 1 + a.guestCount, 0);

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

    // Guests ("+1"/"+2") have no skill data — spread them to keep team headcounts even instead.
    const guestAssignments: { userId: null; guestLabel: string; teamIndex: number }[] = [];
    for (const attendance of presentAttendances) {
      for (let i = 0; i < attendance.guestCount; i++) {
        let minTeam = 0;
        for (let t = 1; t < effectiveTeamCount; t++) {
          if (teamCounts[t] < teamCounts[minTeam]) minTeam = t;
        }
        teamCounts[minTeam] += 1;
        guestAssignments.push({
          userId: null,
          guestLabel: `Invité de ${attendance.user.firstName} #${i + 1}`,
          teamIndex: minTeam,
        });
      }
    }

    await this.assignmentsRepository.delete({ trainingSessionId: sessionId });
    const entities = [...assignments, ...guestAssignments].map((a) =>
      this.assignmentsRepository.create({ trainingSessionId: sessionId, ...a }),
    );
    await this.assignmentsRepository.save(entities);

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
      if (diffMinutes > 29 && diffMinutes <= 30) {
        const alreadyGenerated = await this.hasTeams(session.id);
        if (!alreadyGenerated) {
          sessionsNeedingTeams.push(session);
        }
      }
    }
    return sessionsNeedingTeams;
  }
}
