import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Singleton row (id is always 'default') holding club-wide configuration. */
@Entity('club_settings')
export class ClubSettings {
  @PrimaryColumn({ default: 'default' })
  id: string;

  @Column({ name: 'fff_team_url', type: 'varchar', nullable: true })
  fffTeamUrl: string | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
