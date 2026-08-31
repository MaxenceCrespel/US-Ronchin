import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum TrainingType {
  RECURRING = 'RECURRING',
  ONE_OFF = 'ONE_OFF',
}

@Entity('trainings')
export class Training {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'enum', enum: TrainingType })
  type: TrainingType;

  @Column()
  location: string;

  @Column({ name: 'day_of_week', type: 'int', nullable: true })
  dayOfWeek: number | null;

  @Column({ name: 'start_time', type: 'time' })
  startTime: string;

  @Column({ name: 'end_time', type: 'time' })
  endTime: string;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate: string | null;

  /** Caps how many PRESENT responses count as confirmed for a session of this training
   * (e.g. 16 for a locked 8v8) — null means no cap. Licensed players are ranked ahead of
   * non-licensed ones when the cap is reached; anyone beyond it is waitlisted rather than
   * turned away outright (see AttendancesService.rankAndCapPresent). */
  @Column({ name: 'max_present_players', type: 'int', nullable: true })
  maxPresentPlayers: number | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
