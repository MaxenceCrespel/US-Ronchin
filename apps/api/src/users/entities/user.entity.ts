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
  SUPERADMIN = 'SUPERADMIN',
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

/** Broad pitch band derived from a player's y-coordinate on the formation editor for a
 * SPECIFIC match (`MatchComposition.position`) — never chosen by a user, unrelated to
 * `User.positions` below. Kept separate and unchanged so the pitch layout/coloring logic
 * (`bandForY()` in PitchFormationEditor.tsx) is not affected by more precise sub-positions. */
export enum PlayerPosition {
  GOALKEEPER = 'GOALKEEPER',
  DEFENDER = 'DEFENDER',
  MIDFIELDER = 'MIDFIELDER',
  FORWARD = 'FORWARD',
}

/** A player's own precise, possibly multiple, preferred positions — set on their profile. */
export enum PlayerSubPosition {
  GOALKEEPER = 'GOALKEEPER',
  CENTER_BACK = 'CENTER_BACK',
  RIGHT_BACK = 'RIGHT_BACK',
  LEFT_BACK = 'LEFT_BACK',
  DEFENSIVE_MIDFIELDER = 'DEFENSIVE_MIDFIELDER',
  CENTER_MIDFIELDER = 'CENTER_MIDFIELDER',
  RIGHT_MIDFIELDER = 'RIGHT_MIDFIELDER',
  LEFT_MIDFIELDER = 'LEFT_MIDFIELDER',
  ATTACKING_MIDFIELDER = 'ATTACKING_MIDFIELDER',
  RIGHT_WINGER = 'RIGHT_WINGER',
  LEFT_WINGER = 'LEFT_WINGER',
  STRIKER = 'STRIKER',
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

  @Column({ type: 'enum', enum: PlayerSubPosition, array: true, nullable: true })
  positions: PlayerSubPosition[] | null;

  @Column({ name: 'jersey_number', type: 'int', nullable: true })
  jerseyNumber: number | null;

  @Column({ name: 'preferred_foot', type: 'enum', enum: PreferredFoot, nullable: true })
  preferredFoot: PreferredFoot | null;

  @Column({ name: 'birth_date', type: 'date', nullable: true })
  birthDate: string | null;

  /** Stores a resized image as a base64 data URI — small enough (~256px, compressed) to embed directly. */
  @Column({ name: 'avatar_url', type: 'text', nullable: true })
  avatarUrl: string | null;

  /** Set once the user has been through (or dismissed) the first-login onboarding tour. */
  @Column({ name: 'has_seen_onboarding', default: false })
  hasSeenOnboarding: boolean;

  /** Timestamp of the last authenticated API request from this user — used by the
   * superadmin KPI dashboard to gauge app usage, not a "presence" signal for anything else. */
  @Column({ name: 'last_seen_at', type: 'timestamp', nullable: true })
  lastSeenAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
