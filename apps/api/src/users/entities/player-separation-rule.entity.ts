import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from './user.entity';

/** Two players who should never end up on the same training team — declared by an admin
 * on a player's fiche (see PlayerDetailDialog on the admin dashboard), applied automatically
 * when teams are generated (TeamBalancingService.generateTeams). Order-independent: the
 * service canonicalizes userAId < userBId at creation time so (A,B) and (B,A) can't both
 * exist as separate rows. */
@Entity('player_separation_rules')
@Unique(['userAId', 'userBId'])
export class PlayerSeparationRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_a_id' })
  userAId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_a_id' })
  userA: User;

  @Column({ name: 'user_b_id' })
  userBId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_b_id' })
  userB: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
