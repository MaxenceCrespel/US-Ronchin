import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AwardCategory } from './award-category.entity';
import { User } from '../../users/entities/user.entity';

@Entity('award_votes')
@Index(['categoryId', 'voterId'], { unique: true })
export class AwardVote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'category_id' })
  categoryId: string;

  @ManyToOne(() => AwardCategory, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'category_id' })
  category: AwardCategory;

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

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
