import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Match } from './match.entity';
import { User } from '../../users/entities/user.entity';
import { MatchComposition } from './match-composition.entity';

@Entity('player_ratings')
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

  /** Set when the rated player is a real account. Exactly one of ratedUserId/ratedGuestId
   * is set — enforced in MatchesService.submitRatings, same split as MatchMotmVote's
   * votedForId/votedForGuestId. */
  @Column({ name: 'rated_user_id', nullable: true })
  ratedUserId: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'rated_user_id' })
  ratedUser: User | null;

  /** Set instead of ratedUserId for a guest (no account yet) — same pattern as
   * MatchMotmVote.votedForGuestId: the note stays attached to the composition entry and
   * keeps making sense once the coach links it to a real account later. */
  @Column({ name: 'rated_guest_id', nullable: true })
  ratedGuestId: string | null;

  @ManyToOne(() => MatchComposition, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'rated_guest_id' })
  ratedGuestComposition: MatchComposition | null;

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
