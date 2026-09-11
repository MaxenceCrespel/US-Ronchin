import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('award_categories')
// A category is per-season now (AwardsScheduler opens a fresh row per key every June), so
// the old unique-on-key-alone constraint had to widen to (key, season) — several seasons
// each need their own "Joueur de la saison" row.
@Index(['key', 'season'], { unique: true })
export class AwardCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stable identifier for the fixed category list — used to seed idempotently. */
  @Column()
  key: string;

  @Column()
  title: string;

  /** Null on the handful of legacy rows seeded before season-scoping existed — never
   * re-populated for those, they're just inert history now. Every row AwardsScheduler
   * creates going forward always has one. */
  @Column({ type: 'varchar', nullable: true })
  season: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  /** Set the instant this category's voting closes — either AwardsScheduler's 16 June
   * backstop, or AwardsService.maybeCloseSeasonEarly firing sooner once the whole roster
   * has voted in every category. Null while still open. */
  @Column({ name: 'closed_at', type: 'timestamp', nullable: true })
  closedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
