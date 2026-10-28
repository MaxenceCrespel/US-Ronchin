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

  /** Position in the list the player declared. A relation load has no guaranteed row order,
   * and "which of a player's guests hold a confirmed place" is simply "the first N of this
   * list" (see orderedGuests) — without a stored order that choice could silently change
   * from one load to the next. */
  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;
}
