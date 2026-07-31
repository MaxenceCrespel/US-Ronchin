import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('award_categories')
export class AwardCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stable identifier for the fixed category list — used to seed idempotently. */
  @Column({ unique: true })
  key: string;

  @Column()
  title: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
