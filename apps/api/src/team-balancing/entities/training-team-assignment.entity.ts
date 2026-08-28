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
import { PlayerSubPosition, User } from '../../users/entities/user.entity';

@Entity('training_team_assignments')
@Index(['trainingSessionId', 'userId'], { unique: true })
export class TrainingTeamAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'training_session_id' })
  trainingSessionId: string;

  @ManyToOne(() => TrainingSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'training_session_id' })
  trainingSession: TrainingSession;

  /** Null for a guest slot (a "+1" a player brought along) — they're never a real account. */
  @Column({ name: 'user_id', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  /** Display label for a guest slot, e.g. "Invité de Fabien #1" — null for real players. */
  @Column({ name: 'guest_label', type: 'varchar', nullable: true })
  guestLabel: string | null;

  /** Snapshot of the guest's declared position at generation time (AttendanceGuest.position)
   * — null for real players (whose positions live on their own profile) and for a guest who
   * didn't specify one. Purely for display; band-based team balancing already happened. */
  @Column({ name: 'guest_position', type: 'enum', enum: PlayerSubPosition, nullable: true })
  guestPosition: PlayerSubPosition | null;

  @Column({ name: 'team_index', type: 'int' })
  teamIndex: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
