import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Un abonnement push par appareil — un utilisateur peut en avoir plusieurs (téléphone + PC). */
@Entity('push_subscriptions')
export class PushSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', unique: true })
  endpoint: string;

  @Column({ type: 'varchar' })
  p256dh: string;

  @Column({ type: 'varchar' })
  auth: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  /** Last time the device confirmed this subscription is still live (the app re-sends it on
   * every launch, see PushSync.tsx). Null for rows created before this was tracked. */
  @Column({ name: 'last_seen_at', type: 'timestamp', nullable: true })
  lastSeenAt: Date | null;
}
