import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TrainingSession } from '../../trainings/entities/training-session.entity';
import { User } from '../../users/entities/user.entity';
import { AttendanceStatus } from './attendance.entity';

/** Append-only log of every declared-status change on an Attendance row — status alone only
 * ever holds the CURRENT value, so a disputed "I never touched it" ("Pourquoi José est passé
 * en attente sans avoir touché ?") had no way to be checked. One row per
 * AttendancesService.setAttendance call (both the player's own PUT and the coach's
 * setForPlayer correction), plus one for whoever gets auto-promoted off the waitlist when a
 * confirmed slot frees up. Never read or written to by anything except this trail — it has
 * no bearing on current app behavior. */
@Entity('attendance_status_changes')
@Index(['trainingSessionId', 'userId'])
export class AttendanceStatusChange {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'training_session_id' })
  trainingSessionId: string;

  @ManyToOne(() => TrainingSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'training_session_id' })
  trainingSession: TrainingSession;

  /** Whose attendance this is. */
  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /** Who actually performed the change — the player themselves for a self-service PUT, the
   * coach's id for a setForPlayer correction, or the same as userId for an automatic
   * waitlist promotion (nobody "did" it, it's a side effect of someone else leaving). */
  @Column({ name: 'changed_by' })
  changedBy: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'changed_by' })
  changer: User;

  @Column({ name: 'previous_status', type: 'enum', enum: AttendanceStatus, nullable: true })
  previousStatus: AttendanceStatus | null;

  @Column({ name: 'new_status', type: 'enum', enum: AttendanceStatus })
  newStatus: AttendanceStatus;

  @Column({ name: 'previous_confirmed' })
  previousConfirmed: boolean;

  @Column({ name: 'new_confirmed' })
  newConfirmed: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
