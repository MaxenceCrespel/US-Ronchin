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

  @Column({ name: 'voted_for_id' })
  votedForId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'voted_for_id' })
  votedFor: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
