import { createHash } from 'node:crypto';
import type { User } from '../../users/entities/user.entity';

/** Where a user's photo is served from — a cacheable address instead of the image itself, so
 * lists of users (the squad, ratings, teams...) stay small. The `v` is a fingerprint of the
 * picture: a new photo gets a new address, an unchanged one stays cached for good. */
export function avatarAddress(user: Pick<User, 'id' | 'avatarUrl'>): string | null {
  if (!user.avatarUrl) return null;
  const version = createHash('sha1').update(user.avatarUrl).digest('hex').slice(0, 10);
  return `/api/users/${user.id}/avatar?v=${version}`;
}

export function sanitizeUser<T extends User>(user: T) {
  const { passwordHash, ...publicUser } = user;
  return {
    ...publicUser,
    avatarUrl: avatarAddress(user),
    accountActivated: passwordHash !== null,
  };
}
