import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Match } from './match.entity';
import { User } from '../../users/entities/user.entity';
import { PlayerPosition } from '../../users/entities/user.entity';

@Entity('match_compositions')
@Index(['matchId', 'userId'], { unique: true })
export class MatchComposition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'match_id' })
  matchId: string;

  @ManyToOne(() => Match, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'match_id' })
  match: Match;

  @Column({ name: 'user_id', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  /** Set instead of userId for a player not yet registered in the app — the coach can
   * later link the entry to a real account once that player signs up (linkCompositionGuest). */
  @Column({ name: 'guest_first_name', type: 'varchar', length: 100, nullable: true })
  guestFirstName: string | null;

  @Column({ name: 'guest_last_name', type: 'varchar', length: 100, nullable: true })
  guestLastName: string | null;

  @Column({ name: 'is_starter', default: false })
  isStarter: boolean;

  @Column({ type: 'enum', enum: PlayerPosition, nullable: true })
  position: PlayerPosition | null;

  @Column({ name: 'shirt_number', type: 'int', nullable: true })
  shirtNumber: number | null;

  /** Free placement on the pitch, 0-100 percentage from the top-left — only meaningful for starters. */
  @Column({ name: 'formation_x', type: 'real', nullable: true })
  formationX: number | null;

  @Column({ name: 'formation_y', type: 'real', nullable: true })
  formationY: number | null;

  /** Coach's free-text note on this entry — e.g. flagging that an unlicensed player took
   * the field under a licensed teammate's name on the official sheet, so stats stay
   * correctly attributed to whoever actually played. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  note: string | null;
}
