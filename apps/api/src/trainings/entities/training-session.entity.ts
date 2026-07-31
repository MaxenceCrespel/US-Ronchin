import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Training } from './training.entity';

@Entity('training_sessions')
@Index(['trainingId', 'date'], { unique: true, where: '"training_id" IS NOT NULL' })
export class TrainingSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'training_id', nullable: true })
  trainingId: string | null;

  @ManyToOne(() => Training, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'training_id' })
  training: Training | null;

  @Column({ type: 'date' })
  date: string;

  @Column({ name: 'start_time', type: 'time' })
  startTime: string;

  @Column({ name: 'end_time', type: 'time' })
  endTime: string;

  @Column()
  location: string;

  @Column({ default: false })
  cancelled: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
