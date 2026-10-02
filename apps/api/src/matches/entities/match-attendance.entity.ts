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
import { User, PlayerSubPosition } from '../../users/entities/user.entity';
import { AttendanceStatus } from '../../attendances/entities/attendance.entity';
import { MatchAttendanceGuest } from './match-attendance-guest.entity';

@Entity('match_attendances')
// Partial — a real player still gets at most one row per match, but several guest rows
// (userId null) can coexist since uniqueness on NULL columns never collides in Postgres
// anyway; being explicit here says so on purpose rather than relying on that quirk.
@Index(['matchId', 'userId'], { unique: true, where: '"user_id" IS NOT NULL' })
export class MatchAttendance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'match_id' })
  matchId: string;

  @ManyToOne(() => Match, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'match_id' })
  match: Match;

  /** Null for a guest row — see guestFirstName's own doc comment. */
  @Column({ name: 'user_id', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  /** A real, licensed player the coach knows is coming but who has no app account yet (e.g.
   * "Benjamin, il a sa licence, il sera là dimanche") — entered directly by the coach
   * (MatchesService.addGuestAttendance), always PRESENT, not a self-service RSVP since a
   * guest can't log in to answer for themselves. Exactly one of userId/guestFirstName is set.
   * Deliberately NOT restricted to MatchSource.FRIENDLY, unlike MatchAttendanceGuest's "+1
   * tagalong" (a spectator, never a squad member) — this one goes through the same
   * convocation/lineup flow as any real player, see MatchConvocationCard. */
  @Column({ name: 'guest_first_name', type: 'varchar', length: 100, nullable: true })
  guestFirstName: string | null;

  @Column({ name: 'guest_last_name', type: 'varchar', length: 100, nullable: true })
  guestLastName: string | null;

  @Column({ name: 'guest_position', type: 'enum', enum: PlayerSubPosition, nullable: true })
  guestPosition: PlayerSubPosition | null;

  @Column({ type: 'enum', enum: AttendanceStatus })
  status: AttendanceStatus;

  /** Only ever non-zero on a FRIENDLY match — see MatchesService.setMyAttendance. */
  @Column({ name: 'guest_count', type: 'int', default: 0 })
  guestCount: number;

  /** Set by the coach's convocation (see MatchesService.setConvocation) — only ever true for a
   * player who answered PRESENT. Meaningless until Match.convocationAnnouncedAt is set. */
  @Column({ default: false })
  called: boolean;

  @OneToMany(() => MatchAttendanceGuest, (guest) => guest.matchAttendance)
  guests: MatchAttendanceGuest[];

  @UpdateDateColumn({ name: 'responded_at' })
  respondedAt: Date;
}
