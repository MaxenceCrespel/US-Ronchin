import { sanitizeUser } from './sanitize-user';
import { User } from '../../users/entities/user.entity';

describe('sanitizeUser', () => {
  it('never leaks the password hash and flags an activated account', () => {
    const out = sanitizeUser({
      id: 'u1',
      email: 'a@b.c',
      passwordHash: 'secret',
    } as User);
    expect(out).not.toHaveProperty('passwordHash');
    expect(out.accountActivated).toBe(true);
    expect(out.email).toBe('a@b.c');
  });

  it('marks an account without password as not activated', () => {
    expect(
      sanitizeUser({ id: 'u1', passwordHash: null } as User).accountActivated,
    ).toBe(false);
  });
});

describe('avatar address', () => {
  it('hands out a versioned address instead of the picture itself', () => {
    const a = sanitizeUser({ id: 'u1', passwordHash: 'x', avatarUrl: 'data:image/jpeg;base64,AAAA' } as User);
    expect(a.avatarUrl).toMatch(/^\/api\/users\/u1\/avatar\?v=[0-9a-f]{10}$/);
    expect(JSON.stringify(a)).not.toContain('base64');
  });

  it('changes the version when the picture changes and stays stable otherwise', () => {
    const v = (data: string) => sanitizeUser({ id: 'u1', passwordHash: 'x', avatarUrl: data } as User).avatarUrl;
    expect(v('data:image/jpeg;base64,AAAA')).toBe(v('data:image/jpeg;base64,AAAA'));
    expect(v('data:image/jpeg;base64,AAAA')).not.toBe(v('data:image/jpeg;base64,BBBB'));
  });

  it('has no address without a picture', () => {
    expect(sanitizeUser({ id: 'u1', passwordHash: null, avatarUrl: null } as User).avatarUrl).toBeNull();
  });
});
