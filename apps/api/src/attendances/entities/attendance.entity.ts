import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
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

  @OneToMany(() => AttendanceGuest, (guest) => guest.attendance)
  guests: AttendanceGuest[];

  @UpdateDateColumn({ name: 'responded_at' })
  respondedAt: Date;
}
