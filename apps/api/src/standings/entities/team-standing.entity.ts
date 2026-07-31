import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('team_standings')
export class TeamStanding {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  rank: number;

  @Column({ name: 'team_name' })
  teamName: string;

  @Column({ name: 'is_us', default: false })
  isUs: boolean;

  @Column()
  points: number;

  @Column()
  played: number;

  @Column()
  won: number;

  @Column()
  drawn: number;

  @Column()
  lost: number;

  @Column({ name: 'goals_for' })
  goalsFor: number;

  @Column({ name: 'goals_against' })
  goalsAgainst: number;

  @Column({ name: 'goal_difference' })
  goalDifference: number;
}
