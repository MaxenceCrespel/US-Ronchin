import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum PollReminderKind {
  TRAINING = 'TRAINING',
  MATCH = 'MATCH',
}

/** Dedup record for "you haven't responded to the presence poll" reminders — training and
 * match attendance rows only ever exist once a player responds, so there's nothing on
 * those tables to mark "already reminded" on. One row per (kind, target, user), inserted
 * the first time a reminder goes out so later cron ticks don't resend it. */
@Entity('attendance_poll_reminders')
@Index(['kind', 'targetId', 'userId'], { unique: true })
export class AttendancePollReminder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: PollReminderKind })
  kind: PollReminderKind;

  /** training_session.id or match.id, depending on `kind`. */
  @Column({ name: 'target_id' })
  targetId: string;

  @Column({ name: 'user_id' })
  userId: string;

  @CreateDateColumn({ name: 'sent_at' })
  sentAt: Date;
}
