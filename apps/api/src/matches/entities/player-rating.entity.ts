import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Match } from './match.entity';
import { User } from '../../users/entities/user.entity';

@Entity('player_ratings')
@Index(['matchId', 'raterId', 'ratedUserId'], { unique: true })
export class PlayerRating {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'match_id' })
  matchId: string;

  @ManyToOne(() => Match, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'match_id' })
  match: Match;

  @Column({ name: 'rater_id' })
  raterId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rater_id' })
  rater: User;

  @Column({ name: 'rated_user_id' })
  ratedUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rated_user_id' })
  ratedUser: User;

  // Half-point steps (0, 0.5, 1, ..., 10) — `real` rather than `numeric` so node-postgres
  // returns a plain JS number, no string-to-number transformer needed. `default: 0` is
  // required for the int→real migration itself: without it, TypeORM's synchronize
  // recreates the column via `ADD COLUMN ... NOT NULL`, which Postgres rejects outright
  // on a non-empty table with no default to backfill existing rows.
  @Column({ type: 'real', default: 0 })
  rating: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
