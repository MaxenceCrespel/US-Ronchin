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
import { MatchComposition } from './match-composition.entity';
import { User } from '../../users/entities/user.entity';

/** Same shape and rules as MatchMotmVote — one vote per player per match, tallied the same
 * way (see motm-utils.ts, reused as-is) — except only defenders can be voted for. */
@Entity('match_defense_boss_votes')
@Index(['matchId', 'voterId'], { unique: true })
export class MatchDefenseBossVote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'match_id' })
  matchId: string;

  @ManyToOne(() => Match, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'match_id' })
  match: Match;

  @Column({ name: 'voter_id' })
  voterId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'voter_id' })
  voter: User;

  /** Set when the target is a real account. Exactly one of votedForId/votedForGuestId is
   * set — enforced in MatchesService.voteDefenseBoss. */
  @Column({ name: 'voted_for_id', nullable: true })
  votedForId: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'voted_for_id' })
  votedFor: User | null;

  /** Set instead of votedForId for a guest (no account yet) — the vote resolves to a real
   * winner automatically once the coach links this composition entry to an account. */
  @Column({ name: 'voted_for_guest_id', nullable: true })
  votedForGuestId: string | null;

  @ManyToOne(() => MatchComposition, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'voted_for_guest_id' })
  votedForGuestComposition: MatchComposition | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
