import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'node:crypto';
import { User, UserStatus } from './entities/user.entity';
import { Attendance, AttendanceStatus } from '../attendances/entities/attendance.entity';
import { MatchComposition } from '../matches/entities/match-composition.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';

const SALT_ROUNDS = 10;

/** Unambiguous charset for a temporary password (no 0/O/o, 1/l/L/I/i) — built from letter/digit
 * ranges rather than one dense literal, which a secret scanner's entropy heuristic (correctly,
 * in general) tends to flag as a possible API key. */
function buildTemporaryPasswordCharset(): string {
  const AMBIGUOUS = new Set(['0', 'O', 'o', '1', 'l', 'L', 'I', 'i']);
  const ranges: [string, string][] = [
    ['2', '9'],
    ['A', 'Z'],
    ['a', 'z'],
  ];
  let charset = '';
  for (const [start, end] of ranges) {
    for (let code = start.charCodeAt(0); code <= end.charCodeAt(0); code++) {
      const char = String.fromCharCode(code);
      if (!AMBIGUOUS.has(char)) charset += char;
    }
  }
  return charset;
}

const TEMP_PASSWORD_CHARSET = buildTemporaryPasswordCharset();

function generateTemporaryPassword(length = 10): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += TEMP_PASSWORD_CHARSET[randomInt(TEMP_PASSWORD_CHARSET.length)];
  }
  return result;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Attendance)
    private readonly attendancesRepository: Repository<Attendance>,
    @InjectRepository(MatchComposition)
    private readonly compositionsRepository: Repository<MatchComposition>,
    private readonly pushNotificationsService: PushNotificationsService,
  ) {}

  /** Most regular/assiduous first — real training presences (coach-validated when available)
   * plus match appearances (feuille de match) count equally as "showed up". Every player
   * picker in the app (composition, events, roster...) reuses this order so the coach finds
   * who they need fastest when filling in match data. */
  async findAll(): Promise<User[]> {
    const [users, attendances, compositions] = await Promise.all([
      this.usersRepository.find(),
      this.attendancesRepository.find(),
      this.compositionsRepository.find(),
    ]);

    const presenceCount = new Map<string, number>();
    for (const a of attendances) {
      const effective = a.actualStatus ?? a.status;
      if (effective === AttendanceStatus.PRESENT) {
        presenceCount.set(a.userId, (presenceCount.get(a.userId) ?? 0) + 1);
      }
    }
    for (const c of compositions) {
      if (!c.userId) continue; // guest, not a registered account
      presenceCount.set(c.userId, (presenceCount.get(c.userId) ?? 0) + 1);
    }

    return users.sort((a, b) => {
      const diff = (presenceCount.get(b.id) ?? 0) - (presenceCount.get(a.id) ?? 0);
      if (diff !== 0) return diff;
      return `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`);
    });
  }

  async findById(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('Joueur introuvable');
    }
    return user;
  }

  findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  /** Fire-and-forget from AuthService.login — a fresh sign-in only, a token refresh doesn't
   * count. Feeds the superadmin player-detail dialog. */
  async incrementLoginCount(userId: string): Promise<void> {
    await this.usersRepository.increment({ id: userId }, 'loginCount', 1);
  }

  async createPendingUser(data: {
    email: string;
    firstName: string;
    lastName: string;
    isLicensed: boolean;
  }): Promise<User> {
    const existing = await this.findByEmail(data.email);
    if (existing) {
      throw new ConflictException('Un compte existe déjà avec cet email');
    }
    const user = this.usersRepository.create({
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      isLicensed: data.isLicensed,
      passwordHash: null,
    });
    return this.usersRepository.save(user);
  }

  async setPassword(userId: string, passwordHash: string): Promise<User> {
    const user = await this.findById(userId);
    user.passwordHash = passwordHash;
    return this.usersRepository.save(user);
  }

  /** Coach-only: generates a fresh temporary password, saves its hash, and returns the
   * PLAINTEXT once — never stored or logged anywhere, the coach must relay it to the player
   * directly (WhatsApp, in person...) so they can change it from their own profile after. */
  async resetPassword(userId: string): Promise<string> {
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, SALT_ROUNDS);
    await this.setPassword(userId, passwordHash);
    return temporaryPassword;
  }

  async createJoinedUser(data: {
    email: string;
    firstName: string;
    lastName: string;
    isLicensed: boolean;
    passwordHash: string;
  }): Promise<User> {
    const existing = await this.findByEmail(data.email);
    if (existing) {
      throw new ConflictException('Un compte existe déjà avec cet email');
    }
    const user = this.usersRepository.create({
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      isLicensed: data.isLicensed,
      passwordHash: data.passwordHash,
      status: UserStatus.PENDING,
    });
    const saved = await this.usersRepository.save(user);
    await this.pushNotificationsService.sendToCoaches({
      title: 'Nouveau joueur',
      body: `${saved.firstName} ${saved.lastName} attend une validation`,
      url: '/players',
    });
    return saved;
  }

  async approve(userId: string): Promise<User> {
    const user = await this.findById(userId);
    user.status = UserStatus.ACTIVE;
    return this.usersRepository.save(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<User> {
    const user = await this.findById(userId);
    Object.assign(user, dto);
    return this.usersRepository.save(user);
  }

  async adminUpdate(userId: string, dto: AdminUpdateUserDto): Promise<User> {
    const user = await this.findById(userId);
    Object.assign(user, dto);
    return this.usersRepository.save(user);
  }

  async setAvatar(userId: string, dataUri: string): Promise<User> {
    const user = await this.findById(userId);
    user.avatarUrl = dataUri;
    return this.usersRepository.save(user);
  }

  async removeAvatar(userId: string): Promise<User> {
    const user = await this.findById(userId);
    user.avatarUrl = null;
    return this.usersRepository.save(user);
  }

  async deleteUser(userId: string, requestedBy: string): Promise<void> {
    if (userId === requestedBy) {
      throw new BadRequestException('Impossible de supprimer ton propre compte');
    }
    await this.findById(userId);
    await this.usersRepository.delete(userId);
  }
}
