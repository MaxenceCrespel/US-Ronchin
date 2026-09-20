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

export enum MatchSource {
  FRIENDLY = 'FRIENDLY',
  OFFICIAL_FFF = 'OFFICIAL_FFF',
}

export enum MatchHomeAway {
  HOME = 'HOME',
  AWAY = 'AWAY',
}

export enum MatchStatus {
  SCHEDULED = 'SCHEDULED',
  PLAYED = 'PLAYED',
}

@Entity('matches')
export class Match {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: MatchSource, default: MatchSource.FRIENDLY })
  source: MatchSource;

  @Column({ name: 'fff_match_id', type: 'varchar', nullable: true })
  fffMatchId: string | null;

  @Column({ type: 'date' })
  date: string;

  @Column({ name: 'kick_off_time', type: 'time', nullable: true })
  kickOffTime: string | null;

  @Column()
  opponent: string;

  @Column({ name: 'home_away', type: 'enum', enum: MatchHomeAway })
  homeAway: MatchHomeAway;

  @Column({ type: 'varchar', nullable: true })
  competition: string | null;

  @Column({ type: 'varchar', nullable: true })
  venue: string | null;

  /** e.g. "Pelouse Naturelle"/"Pelouse Synthétique" — only ever known for an OFFICIAL_FFF
   * match (see FffScraperService.scrapeVenue), scraped from the same match-detail page as the
   * venue itself; a friendly match has nowhere to source this from, so it just stays null. */
  @Column({ type: 'varchar', nullable: true })
  surface: string | null;

  @Column({ name: 'score_home', type: 'int', nullable: true })
  scoreHome: number | null;

  @Column({ name: 'score_away', type: 'int', nullable: true })
  scoreAway: number | null;

  @Column({ type: 'enum', enum: MatchStatus, default: MatchStatus.SCHEDULED })
  status: MatchStatus;

  /** Set once the coach clicks "Terminer" at the end of the full composition/events setup
   * wizard — unlocks voting (MOTM, patron de la défense, notes). Deliberately distinct from
   * status PLAYED: that flips as soon as just the score is saved, an earlier, separate step
   * — voting used to open right after composition alone, before the coach had even reached
   * the events step to enter scorers/cards. */
  @Column({ name: 'result_confirmed_at', type: 'timestamptz', nullable: true })
  resultConfirmedAt: Date | null;

  /** Set the first time the coach announces the convocation — from then on every present
   * player can see whether they're called (MatchAttendance.called). */
  @Column({ name: 'convocation_announced_at', type: 'timestamptz', nullable: true })
  convocationAnnouncedAt: Date | null;

  /** The coach's pre-match starting XI. Coach-only working data (select: false keeps it out of
   * every public match payload) — read through MatchesService.getLineup. `lineupSlots` is
   * the ordered user ids, index 0 = goalkeeper, same model as the composition step's slotOrder. */
  @Column({ name: 'lineup_formation', type: 'varchar', nullable: true, select: false })
  lineupFormation: string | null;

  @Column({ name: 'lineup_slots', type: 'jsonb', nullable: true, select: false })
  lineupSlots: string[] | null;

  @Column({ name: 'lineup_validated_at', type: 'timestamptz', nullable: true, select: false })
  lineupValidatedAt: Date | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({
    name: 'result_reminder_sent_at',
    type: 'timestamptz',
    nullable: true,
  })
  resultReminderSentAt: Date | null;

  /** Set once the "results are in" push has gone out for each vote — reveal itself is
   * computed live from votes (see motm-utils.ts), not stored, so these are what keep the
   * one-shot notification from firing again on every later poll that finds it still revealed. */
  @Column({ name: 'motm_revealed_notified_at', type: 'timestamptz', nullable: true })
  motmRevealedNotifiedAt: Date | null;

  @Column({ name: 'defense_boss_revealed_notified_at', type: 'timestamptz', nullable: true })
  defenseBossRevealedNotifiedAt: Date | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
