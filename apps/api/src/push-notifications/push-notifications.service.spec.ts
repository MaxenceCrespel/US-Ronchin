import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as webPush from 'web-push';
import { PushNotificationsService } from './push-notifications.service';
import { PushSubscription } from './entities/push-subscription.entity';
import { User } from '../users/entities/user.entity';
import { NotificationCategory } from './notification-category';

jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(() => Promise.resolve()),
}));

const subs = [
  { id: 's1', userId: 'u1', endpoint: 'e1', p256dh: 'p', auth: 'a' },
  { id: 's2', userId: 'u2', endpoint: 'e2', p256dh: 'p', auth: 'a' },
];
// u2 turned awards off.
const muted: Record<string, NotificationCategory[]> = {
  u2: [NotificationCategory.AWARDS],
};

function queryBuilder<T>(run: (params: Record<string, unknown>) => T[]) {
  const params: Record<string, unknown> = {};
  const qb = {
    select: () => qb,
    where: (_: string, p: Record<string, unknown>) => (
      Object.assign(params, p),
      qb
    ),
    andWhere: (_: string, p: Record<string, unknown>) => (
      Object.assign(params, p),
      qb
    ),
    getMany: () => Promise.resolve(run(params)),
    getRawMany: () => Promise.resolve(run(params)),
  };
  return qb;
}

async function build() {
  const subscriptionsRepo = {
    createQueryBuilder: () =>
      queryBuilder((p) =>
        subs.filter((s) => (p.userIds as string[]).includes(s.userId)),
      ),
  };
  const usersRepo = {
    createQueryBuilder: () =>
      queryBuilder((p) =>
        (p.userIds as string[])
          .filter((id) =>
            muted[id]?.includes(p.category as NotificationCategory),
          )
          .map((id) => ({ id })),
      ),
    findOne: jest.fn(({ where }: { where: { id: string } }) =>
      Promise.resolve({
        id: where.id,
        mutedNotificationCategories: muted[where.id] ?? [],
      }),
    ),
    update: jest.fn(() => Promise.resolve()),
  };
  const config = { get: (key: string) => `test-${key}` };
  const moduleRef = await Test.createTestingModule({
    providers: [
      PushNotificationsService,
      {
        provide: getRepositoryToken(PushSubscription),
        useValue: subscriptionsRepo,
      },
      { provide: getRepositoryToken(User), useValue: usersRepo },
      { provide: ConfigService, useValue: config },
    ],
  }).compile();
  return { service: moduleRef.get(PushNotificationsService), usersRepo };
}

const sent = () =>
  (webPush.sendNotification as jest.Mock).mock.calls.map(
    ([sub]: [{ endpoint: string }]) => sub.endpoint,
  );

describe('PushNotificationsService — muted categories', () => {
  beforeEach(() => (webPush.sendNotification as jest.Mock).mockClear());

  it('skips users who muted the category', async () => {
    const { service } = await build();
    await service.sendToUsers(['u1', 'u2'], {
      title: 't',
      body: 'b',
      url: '/',
      category: NotificationCategory.AWARDS,
    });
    expect(sent()).toEqual(['e1']);
  });

  it('still sends other categories and uncategorised pushes', async () => {
    const { service } = await build();
    await service.sendToUser('u2', {
      title: 't',
      body: 'b',
      url: '/',
      category: NotificationCategory.BADGES,
    });
    await service.sendToUser('u2', { title: 't', body: 'b', url: '/' });
    expect(sent()).toEqual(['e2', 'e2']);
  });

  it('does not send the category to the device', async () => {
    const { service } = await build();
    await service.sendToUser('u1', {
      title: 't',
      body: 'b',
      url: '/x',
      category: NotificationCategory.BADGES,
    });
    const calls = (webPush.sendNotification as jest.Mock).mock.calls as [
      unknown,
      string,
    ][];
    const body = calls[0][1];
    expect(JSON.parse(body)).toEqual({ title: 't', body: 'b', url: '/x' });
  });

  it('stores preferences without duplicates', async () => {
    const { service, usersRepo } = await build();
    const saved = await service.setMutedCategories('u1', [
      NotificationCategory.BIRTHDAYS,
      NotificationCategory.BIRTHDAYS,
    ]);
    expect(saved).toEqual([NotificationCategory.BIRTHDAYS]);
    expect(usersRepo.update).toHaveBeenCalledWith(
      { id: 'u1' },
      { mutedNotificationCategories: [NotificationCategory.BIRTHDAYS] },
    );
    expect(await service.getMutedCategories('u2')).toEqual([
      NotificationCategory.AWARDS,
    ]);
  });
});
