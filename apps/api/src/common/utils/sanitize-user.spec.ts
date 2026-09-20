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
