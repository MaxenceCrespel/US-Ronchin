import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum FffSyncStatus {
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

@Entity('fff_sync_logs')
export class FffSyncLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ name: 'run_at' })
  runAt: Date;

  @Column({ type: 'enum', enum: FffSyncStatus })
  status: FffSyncStatus;

  @Column({ name: 'matches_found', type: 'int', default: 0 })
  matchesFound: number;

  @Column({ name: 'matches_created', type: 'int', default: 0 })
  matchesCreated: number;

  @Column({ name: 'matches_updated', type: 'int', default: 0 })
  matchesUpdated: number;

  @Column({ name: 'error_message', type: 'varchar', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'triggered_by', type: 'uuid', nullable: true })
  triggeredBy: string | null;
}
