import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Match } from './match.entity';
import { User } from '../../users/entities/user.entity';

export enum MatchEventType {
  GOAL = 'GOAL',
  YELLOW_CARD = 'YELLOW_CARD',
  RED_CARD = 'RED_CARD',
}

/** Only meaningful for GOAL events — mirrors the categories the FFF match sheet itself uses. */
export enum GoalType {
  FOOT = 'FOOT',
  HEAD = 'HEAD',
  PENALTY = 'PENALTY',
  OWN_GOAL = 'OWN_GOAL',
}

@Entity('match_events')
export class MatchEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'match_id' })
  matchId: string;

  @ManyToOne(() => Match, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'match_id' })
  match: Match;

  @Column({ type: 'enum', enum: MatchEventType })
  type: MatchEventType;

  @Column({ name: 'user_id', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  /** Free-text name for a player not yet registered in the app — used instead of userId,
   * e.g. a goal scored by someone who hasn't created their account yet. */
  @Column({ name: 'scorer_name', type: 'varchar', length: 100, nullable: true })
  scorerName: string | null;

  @Column({ name: 'assist_user_id', nullable: true })
  assistUserId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'assist_user_id' })
  assistUser: User | null;

  @Column({ type: 'int', nullable: true })
  minute: number | null;

  @Column({ name: 'goal_type', type: 'enum', enum: GoalType, nullable: true })
  goalType: GoalType | null;
}
