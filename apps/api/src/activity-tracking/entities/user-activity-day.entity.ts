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

/** One row per user per calendar day they made at least one authenticated request —
 * lets the superadmin KPI dashboard derive real usage frequency (active days over a
 * period), not just a single "last seen" timestamp. */
@Entity('user_activity_days')
@Index(['userId', 'date'], { unique: true })
export class UserActivityDay {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'date' })
  date: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
