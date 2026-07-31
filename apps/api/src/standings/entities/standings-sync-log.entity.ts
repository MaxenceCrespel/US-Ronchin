import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum StandingsSyncStatus {
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

@Entity('standings_sync_logs')
export class StandingsSyncLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ name: 'run_at' })
  runAt: Date;

  @Column({ type: 'enum', enum: StandingsSyncStatus })
  status: StandingsSyncStatus;

  @Column({ name: 'teams_found', type: 'int', default: 0 })
  teamsFound: number;

  @Column({ name: 'error_message', type: 'varchar', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'triggered_by', type: 'uuid', nullable: true })
  triggeredBy: string | null;
}
