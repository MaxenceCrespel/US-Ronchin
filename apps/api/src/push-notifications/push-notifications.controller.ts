import { Body, Controller, Delete, Get, Post, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
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

  @UseGuards(RolesGuard)
  @Roles(UserRole.COACH)
  @Get('subscribed-users')
  getSubscribedUsers() {
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
