import type { User } from '../../users/entities/user.entity';

export function sanitizeUser<T extends User>(user: T) {
  const { passwordHash, ...publicUser } = user;
  return { ...publicUser, accountActivated: passwordHash !== null };
}
