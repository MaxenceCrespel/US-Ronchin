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

/** Marks that a player has finalized (submitted) all their teammate ratings for a match —
 * once this row exists, their ratings for that match are locked and can't be changed. */
@Entity('match_rating_submissions')
@Index(['matchId', 'raterId'], { unique: true })
export class MatchRatingSubmission {
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

  @CreateDateColumn({ name: 'submitted_at' })
  submittedAt: Date;
}
