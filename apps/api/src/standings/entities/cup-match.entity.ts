import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

/** One match of the cup draw — every pairing of whatever round is currently known, not just
 * ours (see FffScraperService.scrapeCupResults's own doc comment for where this comes from
 * and why the full draw isn't known upfront). The "Coupe" page filters to isUs for our own
 * path; the rest exists mainly so a re-sync has the full context to resolve `isUs` from, same
 * as PoolMatch. The (date, homeTeam, awayTeam) triple is the upsert key for the same reason
 * PoolMatch uses it — not every fixture resolves an fffMatchId from the list view. */
@Entity('cup_matches')
@Unique(['date', 'homeTeam', 'awayTeam'])
export class CupMatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'fff_match_id', type: 'varchar', nullable: true })
  fffMatchId: string | null;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'varchar' })
  round: string;

  @Column({ name: 'home_team' })
  homeTeam: string;

  @Column({ name: 'away_team' })
  awayTeam: string;

  @Column({ name: 'home_logo', type: 'varchar', nullable: true })
  homeLogo: string | null;

  @Column({ name: 'away_logo', type: 'varchar', nullable: true })
  awayLogo: string | null;

  @Column({ name: 'is_us', default: false })
  isUs: boolean;

  @Column({ name: 'score_home', type: 'int', nullable: true })
  scoreHome: number | null;

  @Column({ name: 'score_away', type: 'int', nullable: true })
  scoreAway: number | null;

  @Column({ default: false })
  played: boolean;
}
