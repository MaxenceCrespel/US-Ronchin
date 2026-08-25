import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { Invitation } from './entities/invitation.entity';
import { UsersService } from '../users/users.service';
import { SettingsService } from '../settings/settings.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { JoinDto } from './dto/join.dto';
import { AuthenticatedUser } from './types/authenticated-user';
import { UserRole, UserStatus } from '../users/entities/user.entity';

const INVITATION_TTL_DAYS = 14;
const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Invitation)
    private readonly invitationsRepository: Repository<Invitation>,
    private readonly usersService: UsersService,
    private readonly settingsService: SettingsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private signTokens(user: AuthenticatedUser) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRES_IN', '15m') as JwtSignOptions['expiresIn'],
    });
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d') as JwtSignOptions['expiresIn'],
    });
    return { accessToken, refreshToken };
  }

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Identifiants invalides');
    }
    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Identifiants invalides');
    }
    if (user.status === UserStatus.PENDING) {
      throw new ForbiddenException(
        'Ton compte est en attente de validation par le coach.',
      );
    }
    return this.signTokens({ id: user.id, email: user.email, role: user.role });
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user.passwordHash || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Mot de passe actuel incorrect');
    }
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.usersService.setPassword(userId, passwordHash);
  }

  refresh(refreshToken: string) {
    let payload: { sub: string; email: string; role: UserRole };
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token invalide');
    }
    return this.signTokens({ id: payload.sub, email: payload.email, role: payload.role });
  }

  async createInvitation(dto: CreateInvitationDto) {
    const user = await this.usersService.createPendingUser({
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      isLicensed: dto.isLicensed ?? false,
    });

    const token = randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITATION_TTL_DAYS);

    const invitation = this.invitationsRepository.create({
      token,
      userId: user.id,
      expiresAt,
    });
    await this.invitationsRepository.save(invitation);

    const webAppUrl = this.configService.get<string>('WEB_APP_URL', 'http://localhost:5173');
    return {
      user,
      invitationUrl: `${webAppUrl}/accept-invitation?token=${token}`,
    };
  }

  async join(dto: JoinDto): Promise<void> {
    const settings = await this.settingsService.findByJoinToken(dto.token);
    if (!settings) {
      throw new BadRequestException("Lien d'invitation invalide ou désactivé");
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    await this.usersService.createJoinedUser({
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      isLicensed: dto.isLicensed ?? false,
      passwordHash,
    });
  }

  /** Public status check for a joiner waiting on coach approval — no auth possible yet
   * since they don't have a session, so this is keyed by email only, no secrets returned. */
  async getJoinStatus(email: string): Promise<{ status: 'NOT_FOUND' | 'PENDING' | 'ACTIVE' }> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      return { status: 'NOT_FOUND' };
    }
    return { status: user.status === UserStatus.PENDING ? 'PENDING' : 'ACTIVE' };
  }

  async acceptInvitation(token: string, password: string) {
    const invitation = await this.invitationsRepository.findOne({ where: { token } });
    if (!invitation) {
      throw new BadRequestException("Invitation introuvable");
    }
    if (invitation.usedAt) {
      throw new BadRequestException('Invitation déjà utilisée');
    }
    if (invitation.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Invitation expirée');
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await this.usersService.setPassword(invitation.userId, passwordHash);

    invitation.usedAt = new Date();
    await this.invitationsRepository.save(invitation);

    return this.signTokens({ id: user.id, email: user.email, role: user.role });
  }
}
