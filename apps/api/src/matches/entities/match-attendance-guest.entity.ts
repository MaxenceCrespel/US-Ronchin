import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MatchAttendance } from './match-attendance.entity';

/** A named "+1" a player brings to a friendly match — same idea as AttendanceGuest for
 * trainings, restricted to MatchSource.FRIENDLY (see MatchesService.setMyAttendance): an
 * officially licensed match can't field an informal guest. No position field — unlike
 * trainings, match team composition is a manual step the coach does afterwards
 * (MatchDetailPage's own composition guest flow), not an automatic balance pass. */
@Entity('match_attendance_guests')
export class MatchAttendanceGuest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'match_attendance_id' })
  matchAttendanceId: string;

  @ManyToOne(() => MatchAttendance, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'match_attendance_id' })
  matchAttendance: MatchAttendance;

  @Column({ name: 'first_name', type: 'varchar', length: 100 })
  firstName: string;

  @Column({ name: 'last_name', type: 'varchar', length: 100, nullable: true })
  lastName: string | null;
}
