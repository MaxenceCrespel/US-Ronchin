import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { Invitation } from './entities/invitation.entity';
import { UsersService } from '../users/users.service';
import { UserRole, UserStatus } from '../users/entities/user.entity';

const SECRETS: Record<string, string> = {
  JWT_ACCESS_SECRET: 'access-secret-for-tests',
  JWT_REFRESH_SECRET: 'refresh-secret-for-tests',
};

async function build(
  over: {
    users?: Partial<UsersService>;
    invitation?: Partial<Invitation> | null;
  } = {},
) {
  const invitationsRepo = {
    findOne: jest.fn().mockResolvedValue(over.invitation ?? null),
    create: jest.fn((i: unknown) => i),
    save: jest.fn((i: unknown) => Promise.resolve(i)),
  };
  const users = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    setPassword: jest.fn(),
    createPendingUser: jest.fn(),
    createJoinedUser: jest.fn().mockResolvedValue(undefined),
    ...over.users,
  };
  const moduleRef = await Test.createTestingModule({
    providers: [
      AuthService,
      JwtService,
      { provide: getRepositoryToken(Invitation), useValue: invitationsRepo },
      { provide: UsersService, useValue: users },
      {
        provide: ConfigService,
        useValue: {
          getOrThrow: (k: string) => SECRETS[k],
          get: (k: string, d?: string) => SECRETS[k] ?? d,
        },
      },
    ],
  }).compile();
  return {
    service: moduleRef.get(AuthService),
    users,
    invitationsRepo,
    jwt: moduleRef.get(JwtService),
  };
}

describe('AuthService.login', () => {
  const hash = bcrypt.hashSync('Correct-Pass-1', 4);
  const activeUser = {
    id: 'u1',
    email: 'a@b.c',
    role: UserRole.PLAYER,
    status: UserStatus.ACTIVE,
    passwordHash: hash,
  };

  it('returns access + refresh tokens for valid credentials', async () => {
    const { service, jwt } = await build({
      users: { findByEmail: jest.fn().mockResolvedValue(activeUser) },
    });
    const tokens = await service.login('a@b.c', 'Correct-Pass-1');
    const payload = jwt.verify<{ sub: string; role: string }>(
      tokens.accessToken,
      {
        secret: SECRETS.JWT_ACCESS_SECRET,
      },
    );
    expect(payload).toMatchObject({ sub: 'u1', role: 'PLAYER' });
    expect(tokens.refreshToken).toBeTruthy();
  });

  it('uses the same message for a wrong password and an unknown account', async () => {
    const wrong = await build({
      users: { findByEmail: jest.fn().mockResolvedValue(activeUser) },
    });
    const unknown = await build({
      users: { findByEmail: jest.fn().mockResolvedValue(null) },
    });
    const e1 = await wrong.service
      .login('a@b.c', 'nope')
      .catch((e: Error) => e);
    const e2 = await unknown.service
      .login('x@y.z', 'nope')
      .catch((e: Error) => e);
    expect(e1).toBeInstanceOf(UnauthorizedException);
    expect(e2).toBeInstanceOf(UnauthorizedException);
    expect((e1 as Error).message).toBe((e2 as Error).message);
  });

  it('rejects an account without a password yet', async () => {
    const { service } = await build({
      users: {
        findByEmail: jest
          .fn()
          .mockResolvedValue({ ...activeUser, passwordHash: null }),
      },
    });
    await expect(service.login('a@b.c', 'x')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('blocks a pending account even with the right password', async () => {
    const { service } = await build({
      users: {
        findByEmail: jest
          .fn()
          .mockResolvedValue({ ...activeUser, status: UserStatus.PENDING }),
      },
    });
    await expect(
      service.login('a@b.c', 'Correct-Pass-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('AuthService.refresh', () => {
  it('issues new tokens from a valid refresh token', async () => {
    const { service, jwt } = await build();
    const refresh = jwt.sign(
      { sub: 'u1', email: 'a@b.c', role: 'COACH' },
      { secret: SECRETS.JWT_REFRESH_SECRET },
    );
    const tokens = service.refresh(refresh);
    expect(
      jwt.verify<{ role: string }>(tokens.accessToken, {
        secret: SECRETS.JWT_ACCESS_SECRET,
      }).role,
    ).toBe('COACH');
  });

  it('rejects garbage and tokens signed with the wrong secret', async () => {
    const { service, jwt } = await build();
    expect(() => service.refresh('garbage')).toThrow(UnauthorizedException);
    const access = jwt.sign(
      { sub: 'u1' },
      { secret: SECRETS.JWT_ACCESS_SECRET },
    );
    expect(() => service.refresh(access)).toThrow(UnauthorizedException);
  });
});

describe('AuthService.changePassword', () => {
  it('stores a new hash when the current password is right', async () => {
    const hash = bcrypt.hashSync('old-password', 4);
    const setPassword = jest.fn();
    const { service } = await build({
      users: {
        findById: jest.fn().mockResolvedValue({ passwordHash: hash }),
        setPassword,
      },
    });
    await service.changePassword('u1', 'old-password', 'new-password-123');
    const stored = setPassword.mock.calls[0][1] as string;
    expect(await bcrypt.compare('new-password-123', stored)).toBe(true);
  });

  it('refuses a wrong current password without touching the stored one', async () => {
    const setPassword = jest.fn();
    const { service } = await build({
      users: {
        findById: jest.fn().mockResolvedValue({
          passwordHash: bcrypt.hashSync('old-password', 4),
        }),
        setPassword,
      },
    });
    await expect(
      service.changePassword('u1', 'wrong', 'new-password-123'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(setPassword).not.toHaveBeenCalled();
  });
});

describe('AuthService.join / getJoinStatus', () => {
  it('never lets a joiner self-declare as licensed and never stores the clear password', async () => {
    const { service, users } = await build();
    await service.join({
      email: 'n@n.n',
      firstName: 'N',
      lastName: 'N',
      password: 'PlainPassword1',
      isLicensed: true,
    } as never);
    const arg = (users.createJoinedUser as jest.Mock).mock.calls[0][0] as {
      isLicensed: boolean;
      passwordHash: string;
    };
    expect(arg.isLicensed).toBe(false);
    expect(arg.passwordHash).not.toBe('PlainPassword1');
    expect(await bcrypt.compare('PlainPassword1', arg.passwordHash)).toBe(true);
  });

  it('reports the status of a joiner by email', async () => {
    const find = (u: unknown) =>
      build({ users: { findByEmail: jest.fn().mockResolvedValue(u) } });
    expect(await (await find(null)).service.getJoinStatus('x')).toEqual({
      status: 'NOT_FOUND',
    });
    expect(
      await (
        await find({ status: UserStatus.PENDING })
      ).service.getJoinStatus('x'),
    ).toEqual({ status: 'PENDING' });
    expect(
      await (
        await find({ status: UserStatus.ACTIVE })
      ).service.getJoinStatus('x'),
    ).toEqual({
      status: 'ACTIVE',
    });
  });
});

describe('AuthService.acceptInvitation', () => {
  const inv = (over: Partial<Invitation>) => ({
    token: 't',
    userId: 'u1',
    usedAt: null,
    expiresAt: new Date(Date.now() + 86_400_000),
    ...over,
  });

  it('accepts a valid invitation once and marks it used', async () => {
    const { service, invitationsRepo } = await build({
      invitation: inv({}),
      users: {
        setPassword: jest.fn().mockResolvedValue({
          id: 'u1',
          email: 'a@b.c',
          role: UserRole.PLAYER,
        }),
      },
    });
    const tokens = await service.acceptInvitation('t', 'NewPassword1');
    expect(tokens.accessToken).toBeTruthy();
    expect(invitationsRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ usedAt: expect.any(Date) }),
    );
  });

  it.each([
    ['unknown', null],
    ['already used', inv({ usedAt: new Date() })],
    ['expired', inv({ expiresAt: new Date(Date.now() - 1000) })],
  ])('rejects a %s invitation', async (_label, invitation) => {
    const { service } = await build({ invitation });
    await expect(
      service.acceptInvitation('t', 'NewPassword1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
