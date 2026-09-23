import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

/** A coach/admin's private 1-10 assessment of a player's general level — the seed the
 * skill-score formula starts from (see StatsService.getPlayerStats), blended with the
 * player's own match/training record as it accumulates and never shown back to any coach
 * but its author (PlayerRatingsController), so it can't be influenced by seeing a computed
 * level or another coach's opinion. One row per (coach, player) pair, upserted in place —
 * there's no history to keep, only the latest read on the player's level. */
@Entity('coach_player_ratings')
@Unique(['coachId', 'playerId'])
export class CoachPlayerRating {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'coach_id' })
  coachId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'coach_id' })
  coach: User;

  @Column({ name: 'player_id' })
  playerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'player_id' })
  player: User;

  // 1-10, half-points allowed (2 * rating is an integer from 2 to 20) — enforced in the DTO.
  @Column('numeric', { precision: 3, scale: 1 })
  rating: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
