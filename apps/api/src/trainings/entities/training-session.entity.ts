import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Training } from './training.entity';

@Entity('training_sessions')
@Index(['trainingId', 'date'], { unique: true, where: '"training_id" IS NOT NULL' })
export class TrainingSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'training_id', nullable: true })
  trainingId: string | null;

  @ManyToOne(() => Training, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'training_id' })
  training: Training | null;

  @Column({ type: 'date' })
  date: string;

  @Column({ name: 'start_time', type: 'time' })
  startTime: string;

  @Column({ name: 'end_time', type: 'time' })
  endTime: string;

  @Column()
  location: string;

  @Column({ default: false })
  cancelled: boolean;

  /** Set once a "pointage réel manquant" push reminder has been sent for this session —
   * never repeated, mirrors Match.resultReminderSentAt. */
  @Column({ name: 'attendance_reminder_sent_at', type: 'timestamp', nullable: true })
  attendanceReminderSentAt: Date | null;

  /** One-off exception to the parent Training's cap, for this session only — null means
   * "inherit the template's maxPresentPlayers" (see AttendancesService.setAttendance,
   * TrainingsService.findSessionsBetween). Lets a coach bump up (or down) tonight's spots
   * without touching every other week of a RECURRING series — editing the template itself
   * (via "Gérer les entraînements") still changes the default for every session that
   * hasn't set its own override. */
  @Column({ name: 'max_present_players_override', type: 'int', nullable: true })
  maxPresentPlayersOverride: number | null;

  /** Intra-squad scrimmage score — team 0 vs team 1 (generateTeams always creates exactly
   * two). Null until the coach enters it; feeds the training ranking (see
   * TeamBalancingService.getTrainingRanking). */
  @Column({ name: 'score_team0', type: 'int', nullable: true })
  scoreTeam0: number | null;

  @Column({ name: 'score_team1', type: 'int', nullable: true })
  scoreTeam1: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
