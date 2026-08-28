import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Attendance } from './attendance.entity';
import { PlayerSubPosition } from '../../users/entities/user.entity';

/** A named "+1" a player brings to training — replaces the old anonymous guestCount. */
@Entity('attendance_guests')
export class AttendanceGuest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'attendance_id' })
  attendanceId: string;

  @ManyToOne(() => Attendance, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'attendance_id' })
  attendance: Attendance;

  @Column({ name: 'first_name', type: 'varchar', length: 100 })
  firstName: string;

  @Column({ name: 'last_name', type: 'varchar', length: 100, nullable: true })
  lastName: string | null;

  /** Optional, whoever declares the guest sets it — makes the guest slot more informative
   * (shown next to their name) and lets TeamBalancingService.generateTeams spread guests
   * across teams by position band, not just headcount. */
  @Column({ type: 'enum', enum: PlayerSubPosition, nullable: true })
  position: PlayerSubPosition | null;
}
