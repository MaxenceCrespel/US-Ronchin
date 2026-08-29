import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Match } from './match.entity';
import { User } from '../../users/entities/user.entity';
import { AttendanceStatus } from '../../attendances/entities/attendance.entity';
import { MatchAttendanceGuest } from './match-attendance-guest.entity';

@Entity('match_attendances')
@Index(['matchId', 'userId'], { unique: true })
export class MatchAttendance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'match_id' })
  matchId: string;

  @ManyToOne(() => Match, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'match_id' })
  match: Match;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'enum', enum: AttendanceStatus })
  status: AttendanceStatus;

  /** Only ever non-zero on a FRIENDLY match — see MatchesService.setMyAttendance. */
  @Column({ name: 'guest_count', type: 'int', default: 0 })
  guestCount: number;

  @OneToMany(() => MatchAttendanceGuest, (guest) => guest.matchAttendance)
  guests: MatchAttendanceGuest[];

  @UpdateDateColumn({ name: 'responded_at' })
  respondedAt: Date;
}
