import { Body, Controller, Delete, ForbiddenException, Get, Post, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { UserRole } from '../users/entities/user.entity';
import { PushNotificationsService } from './push-notifications.service';
import { SubscribeDto } from './dto/subscribe.dto';
import { UnsubscribeDto } from './dto/unsubscribe.dto';

@UseGuards(JwtAuthGuard)
@Controller('push')
export class PushNotificationsController {
  constructor(
    private readonly pushNotificationsService: PushNotificationsService,
    private readonly configService: ConfigService,
  ) {}

  @Get('vapid-public-key')
  getVapidPublicKey() {
    return {
      publicKey: this.configService.get<string>('VAPID_PUBLIC_KEY') ?? null,
    };
  }

  // Admin-only, deliberately narrower than the usual coach-or-admin split (RolesGuard
  // always lets SUPERADMIN through any @Roles(...) list, so it can't express "admin but
  // not coach" — a plain coach account shouldn't see who's opted into notifications).
  @Get('subscribed-users')
  getSubscribedUsers(@CurrentUser() currentUser: AuthenticatedUser) {
    if (currentUser.role !== UserRole.SUPERADMIN) {
      throw new ForbiddenException();
    }
    return this.pushNotificationsService.getSubscribedUserIds();
  }

  @Post('subscribe')
  subscribe(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: SubscribeDto,
  ) {
    return this.pushNotificationsService.subscribe(currentUser.id, dto);
  }

  @Delete('subscribe')
  unsubscribe(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: UnsubscribeDto,
  ) {
    return this.pushNotificationsService.unsubscribe(
      currentUser.id,
      dto.endpoint,
    );
  }
}
