import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as webPush from 'web-push';
import { PushSubscription } from './entities/push-subscription.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { SubscribeDto } from './dto/subscribe.dto';

export interface PushPayload {
  title: string;
  body: string;
  url: string;
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
      await this.subscriptionsRepository.save(existing);
      return;
    }
    await this.subscriptionsRepository.save(
      this.subscriptionsRepository.create({
        userId,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
      }),
    );
  }

  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.subscriptionsRepository.delete({ userId, endpoint });
  }

  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    const subscriptions = await this.subscriptionsRepository.find({
      where: { userId },
    });
    await this.sendToSubscriptions(subscriptions, payload);
  }

  async sendToUsers(userIds: string[], payload: PushPayload): Promise<void> {
    if (userIds.length === 0) return;
    const subscriptions = await this.subscriptionsRepository
      .createQueryBuilder('sub')
      .where('sub.user_id IN (:...userIds)', { userIds })
      .getMany();
    await this.sendToSubscriptions(subscriptions, payload);
  }

  async sendToCoaches(payload: PushPayload): Promise<void> {
    const coaches = await this.usersRepository.find({
      where: { role: UserRole.COACH },
    });
    await this.sendToUsers(
      coaches.map((c) => c.id),
      payload,
    );
  }

  private async sendToSubscriptions(
    subscriptions: PushSubscription[],
    payload: PushPayload,
  ): Promise<void> {
    if (!this.configured) return;
    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webPush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            JSON.stringify(payload),
          );
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
