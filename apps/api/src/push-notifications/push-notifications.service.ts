import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as webPush from 'web-push';
import { PushSubscription } from './entities/push-subscription.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { SubscribeDto } from './dto/subscribe.dto';
import { NotificationCategory } from './notification-category';

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  /** Lets a user mute this kind of push. Omitted → always sent. Never sent to the device. */
  category?: NotificationCategory;
}

@Injectable()
export class PushNotificationsService {
  private readonly logger = new Logger(PushNotificationsService.name);

  private readonly configured: boolean;

  constructor(
    @InjectRepository(PushSubscription)
    private readonly subscriptionsRepository: Repository<PushSubscription>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    configService: ConfigService,
  ) {
    const subject = configService.get<string>('VAPID_SUBJECT');
    const publicKey = configService.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = configService.get<string>('VAPID_PRIVATE_KEY');
    if (subject && publicKey && privateKey) {
      webPush.setVapidDetails(subject, publicKey, privateKey);
      this.configured = true;
    } else {
      this.configured = false;
      this.logger.warn(
        'VAPID_SUBJECT/VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY non configurées — notifications push désactivées. Génère une paire avec `npx web-push generate-vapid-keys`.',
      );
    }
  }

  async subscribe(userId: string, dto: SubscribeDto): Promise<void> {
    const existing = await this.subscriptionsRepository.findOne({
      where: { endpoint: dto.endpoint },
    });
    if (existing) {
      existing.userId = userId;
      existing.p256dh = dto.keys.p256dh;
      existing.auth = dto.keys.auth;
      existing.lastSeenAt = new Date();
      await this.subscriptionsRepository.save(existing);
      return;
    }
    await this.subscriptionsRepository.save(
      this.subscriptionsRepository.create({
        userId,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        lastSeenAt: new Date(),
      }),
    );
  }

  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.subscriptionsRepository.delete({ userId, endpoint });
  }

  /** Distinct users with at least one active subscription — a player can have several
   * (phone + laptop), only whether they have any matters here. Coach-facing "who's
   * actually reachable" view. */
  async getSubscribedUserIds(): Promise<string[]> {
    const rows = await this.subscriptionsRepository
      .createQueryBuilder('sub')
      .select('DISTINCT sub.user_id', 'userId')
      .getRawMany<{ userId: string }>();
    return rows.map((r) => r.userId);
  }

  async getMutedCategories(userId: string): Promise<NotificationCategory[]> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: { id: true, mutedNotificationCategories: true },
    });
    return user?.mutedNotificationCategories ?? [];
  }

  async setMutedCategories(
    userId: string,
    categories: NotificationCategory[],
  ): Promise<NotificationCategory[]> {
    const unique = [...new Set(categories)];
    await this.usersRepository.update(
      { id: userId },
      { mutedNotificationCategories: unique },
    );
    return unique;
  }

  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    await this.sendToUsers([userId], payload);
  }

  async sendToUsers(userIds: string[], payload: PushPayload): Promise<void> {
    userIds = await this.withoutMuted(userIds, payload.category);
    if (userIds.length === 0) return;
    const subscriptions = await this.subscriptionsRepository
      .createQueryBuilder('sub')
      .where('sub.user_id IN (:...userIds)', { userIds })
      .getMany();
    await this.sendToSubscriptions(subscriptions, payload);
  }

  async sendToCoaches(payload: PushPayload): Promise<void> {
    const coaches = await this.usersRepository.find({
      where: { role: In([UserRole.COACH, UserRole.SUPERADMIN]) },
    });
    await this.sendToUsers(
      coaches.map((c) => c.id),
      payload,
    );
  }

  /** Drops the users who turned this category off on their notifications screen. */
  private async withoutMuted(
    userIds: string[],
    category: NotificationCategory | undefined,
  ): Promise<string[]> {
    if (!category || userIds.length === 0) return userIds;
    const muted = await this.usersRepository
      .createQueryBuilder('user')
      .select('user.id', 'id')
      .where('user.id IN (:...userIds)', { userIds })
      .andWhere(':category = ANY(user.muted_notification_categories)', {
        category,
      })
      .getRawMany<{ id: string }>();
    if (muted.length === 0) return userIds;
    const mutedIds = new Set(muted.map((m) => m.id));
    return userIds.filter((id) => !mutedIds.has(id));
  }

  private async sendToSubscriptions(
    subscriptions: PushSubscription[],
    payload: PushPayload,
  ): Promise<void> {
    if (!this.configured) {
      this.logger.warn(`Envoi ignoré (VAPID non configuré) — payload: "${payload.title}"`);
      return;
    }
    if (subscriptions.length === 0) {
      this.logger.log(`Aucun abonnement à notifier pour "${payload.title}"`);
      return;
    }
    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webPush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            JSON.stringify({
              title: payload.title,
              body: payload.body,
              url: payload.url,
            }),
          );
          this.logger.log(`Notification envoyée (${sub.id}): "${payload.title}"`);
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await this.subscriptionsRepository.delete({ id: sub.id });
          } else {
            this.logger.warn(
              `Échec d'envoi de la notification push (${sub.id}): ${error instanceof Error ? error.message : error}`,
            );
          }
        }
      }),
    );
  }
}
