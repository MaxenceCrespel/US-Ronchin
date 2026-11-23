import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Singleton row (id is always 'default') holding club-wide configuration. */
@Entity('club_settings')
export class ClubSettings {
  @PrimaryColumn({ default: 'default' })
  id: string;

  @Column({ name: 'fff_team_url', type: 'varchar', nullable: true })
  fffTeamUrl: string | null;

  /** The championship's page on epreuves.fff.fr (".../competition/engagement/{id}-{slug}/phase/
   * {phase}/{poule}/...") — unlike fffTeamUrl's per-team calendar, it covers every match of the
   * poule and the standings (see fff-competition.ts). */
  @Column({ name: 'fff_championship_url', type: 'varchar', nullable: true })
  fffChampionshipUrl: string | null;

  /** Same kind of page for the cup — every round drawn so far. */
  @Column({ name: 'fff_cup_url', type: 'varchar', nullable: true })
  fffCupUrl: string | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
