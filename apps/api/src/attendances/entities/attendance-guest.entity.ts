import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Attendance } from './attendance.entity';

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
}
