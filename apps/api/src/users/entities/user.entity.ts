import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum UserRole {
  PLAYER = 'PLAYER',
  COACH = 'COACH',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  PENDING = 'PENDING',
}

export enum PreferredFoot {
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
  BOTH = 'BOTH',
}

export enum PlayerPosition {
  GOALKEEPER = 'GOALKEEPER',
  DEFENDER = 'DEFENDER',
  MIDFIELDER = 'MIDFIELDER',
  FORWARD = 'FORWARD',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'password_hash', type: 'varchar', nullable: true })
  passwordHash: string | null;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.PLAYER })
  role: UserRole;

  /** A coach who also plays (e.g. player-manager/captain) — makes them eligible for
   * every player-facing pool (composition, events, stats, badges, ratings...) on top
   * of their coach-only admin capabilities. */
  @Column({ name: 'is_playing_coach', default: false })
  isPlayingCoach: boolean;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus;

  @Column({ name: 'first_name' })
  firstName: string;

  @Column({ name: 'last_name' })
  lastName: string;

  @Column({ name: 'is_licensed', default: false })
  isLicensed: boolean;

  @Column({ name: 'license_number', type: 'varchar', nullable: true })
  licenseNumber: string | null;

  @Column({ type: 'enum', enum: PlayerPosition, nullable: true })
  position: PlayerPosition | null;

  @Column({ name: 'jersey_number', type: 'int', nullable: true })
  jerseyNumber: number | null;

  @Column({ name: 'preferred_foot', type: 'enum', enum: PreferredFoot, nullable: true })
  preferredFoot: PreferredFoot | null;

  @Column({ name: 'height_cm', type: 'int', nullable: true })
  heightCm: number | null;

  @Column({ name: 'weight_kg', type: 'int', nullable: true })
  weightKg: number | null;

  @Column({ name: 'birth_date', type: 'date', nullable: true })
  birthDate: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  /** Stores a resized image as a base64 data URI — small enough (~256px, compressed) to embed directly. */
  @Column({ name: 'avatar_url', type: 'text', nullable: true })
  avatarUrl: string | null;

  /** Set once the user has been through (or dismissed) the first-login onboarding tour. */
  @Column({ name: 'has_seen_onboarding', default: false })
  hasSeenOnboarding: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
