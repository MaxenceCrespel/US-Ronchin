import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TrainingSession } from '../../trainings/entities/training-session.entity';
import { User } from '../../users/entities/user.entity';
import { AttendanceGuest } from './attendance-guest.entity';

export enum AttendanceStatus {
  PRESENT = 'PRESENT',
  ABSENT = 'ABSENT',
  MAYBE = 'MAYBE',
}

@Entity('attendances')
@Index(['trainingSessionId', 'userId'], { unique: true })
export class Attendance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'training_session_id' })
  trainingSessionId: string;

  @ManyToOne(() => TrainingSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'training_session_id' })
  trainingSession: TrainingSession;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /** What the player declared themselves — null until they respond. */
  @Column({ type: 'enum', enum: AttendanceStatus, nullable: true })
  status: AttendanceStatus | null;

  /** What the coach actually observed at training — null until validated.
   * Deliberately distinct from `status`: comparing the two is what powers the
   * "Beau Parleur" / "Invité Surprise" badges. */
  @Column({ name: 'actual_status', type: 'enum', enum: AttendanceStatus, nullable: true })
  actualStatus: AttendanceStatus | null;

  /** Extra people this player brings along (friends, family...) — kept in sync with
   * guests.length on every save. They're never registered as app users and never appear
   * in stats/badges, only as a named entry in `guests` (see AttendanceGuest). */
  @Column({ name: 'guest_count', type: 'int', default: 0 })
  guestCount: number;

  /** False only when status is PRESENT and the training's maxPresentPlayers cap was already
   * full at the moment this player declared present — they're on the waitlist. Always true
   * for a non-PRESENT status or when the training has no cap. Persisted (not recomputed on
   * every read) so a slot, once granted, sticks with whoever holds it — see
   * AttendancesService.setAttendance/promoteNextWaitlisted for how it's kept in sync. */
  @Column({ default: true })
  confirmed: boolean;

  @OneToMany(() => AttendanceGuest, (guest) => guest.attendance)
  guests: AttendanceGuest[];

  // Deliberately app-managed rather than @UpdateDateColumn: that auto-touches on ANY save,
  // including the coach's later validateAttendance() (actualStatus) — which isn't the
  // player's own response at all. Set explicitly in AttendancesService.setAttendance only,
  // so this stays a true "when did they last declare a status" timestamp — used to break
  // ties on the waitlist (see rankAndCapPresent) when several players share the same
  // license-priority tier.
  @Column({ name: 'responded_at', type: 'timestamp' })
  respondedAt: Date;
}
