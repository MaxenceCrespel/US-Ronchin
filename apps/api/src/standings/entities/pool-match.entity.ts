import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

/** One match of the whole poule for the season — not just ours (see
 * FffScraperService.scrapeChampionshipCalendar's own doc comment for where this comes from). Shown
 * alongside TeamStanding on the "Championnat" page so the standings aren't the only window
 * into how the season is actually going. The (date, homeTeam, awayTeam) triple is what a
 * re-sync upserts on — fffMatchId isn't always resolvable from the calendar list (only
 * played matches link to their own detail page), so it can't be the sole key. */
@Entity('pool_matches')
@Unique(['date', 'homeTeam', 'awayTeam'])
export class PoolMatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'fff_match_id', type: 'varchar', nullable: true })
  fffMatchId: string | null;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'varchar', nullable: true })
  matchday: string | null;

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
