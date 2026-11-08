import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('user_badges')
@Index(['userId', 'badgeKey'], { unique: true })
export class UserBadge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'badge_key' })
  badgeKey: string;

  @Column({ type: 'int', default: 1 })
  count: number;

  /** Granted by an admin (BadgesService.grantManually) — the automatic re-evaluation never
   * revokes these, whatever the eligibility now says. */
  @Column({ default: false })
  manual: boolean;

  @CreateDateColumn({ name: 'earned_at' })
  earnedAt: Date;
}
