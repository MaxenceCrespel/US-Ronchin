import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { UserRole } from './entities/user.entity';
import { PlayerRatingsService } from './player-ratings.service';
import { SetPlayerRatingDto } from './dto/set-player-rating.dto';

// Coach/admin only — a player never sees this list, its own rating included, so a coach's
// assessment can't be influenced by knowing what anyone thinks (see CoachPlayerRating).
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.COACH)
@Controller('player-ratings')
export class PlayerRatingsController {
  constructor(private readonly ratingsService: PlayerRatingsService) {}

  @Get('mine')
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.ratingsService.listForCoach(user.id);
  }

  @Put(':playerId')
  setRating(
    @Param('playerId') playerId: string,
    @Body() dto: SetPlayerRatingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ratingsService.setRating(user.id, playerId, dto.rating);
  }
}
