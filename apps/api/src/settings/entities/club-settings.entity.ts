import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Singleton row (id is always 'default') holding club-wide configuration. */
@Entity('club_settings')
export class ClubSettings {
  @PrimaryColumn({ default: 'default' })
  id: string;

  @Column({ name: 'fff_team_url', type: 'varchar', nullable: true })
  fffTeamUrl: string | null;

  /** The district's own competition page (e.g. flandres.fff.fr/competitions?...&type=ch) —
   * unlike fffTeamUrl's per-team calendar, this lists every pairing of the poule grouped by
   * journée directly, which is what "Résultats de la poule" actually needs. */
  @Column({ name: 'fff_championship_url', type: 'varchar', nullable: true })
  fffChampionshipUrl: string | null;

  /** Same district competition page, but the cup draw (...&type=cp) — one round at a time,
   * walked backward to "1er tour" since the next round doesn't exist until it's drawn. */
  @Column({ name: 'fff_cup_url', type: 'varchar', nullable: true })
  fffCupUrl: string | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
