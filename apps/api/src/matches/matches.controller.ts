import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { UserRole } from '../users/entities/user.entity';
import { MatchesService } from './matches.service';
import { CreateMatchDto } from './dto/create-match.dto';
import { UpdateMatchDto } from './dto/update-match.dto';
import { SetCompositionDto } from './dto/set-composition.dto';
import { LinkCompositionGuestDto } from './dto/link-composition-guest.dto';
import { CreateMatchEventDto } from './dto/create-match-event.dto';
import { RatePlayerDto } from './dto/rate-player.dto';
import { SubmitRatingsDto } from './dto/submit-ratings.dto';
import { VoteMotmDto } from './dto/vote-motm.dto';
import { VoteDefenseBossDto } from './dto/vote-defense-boss.dto';
import { SetAttendanceDto } from '../attendances/dto/set-attendance.dto';
import { sanitizeUser } from '../common/utils/sanitize-user';

@UseGuards(JwtAuthGuard)
@Controller('matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get()
  findAll() {
    return this.matchesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.matchesService.findById(id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.COACH)
  @Post()
  create(@Body() dto: CreateMatchDto, @CurrentUser() currentUser: AuthenticatedUser) {
    return this.matchesService.create(dto, currentUser.id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.COACH)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMatchDto) {
    return this.matchesService.update(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.COACH)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.matchesService.delete(id);
  }

  @Get(':id/composition')
  async getComposition(@Param('id') id: string) {
    const composition = await this.matchesService.getComposition(id);
    return composition.map((entry) => ({
      ...entry,
      user: entry.user ? sanitizeUser(entry.user) : null,
    }));
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.COACH)
  @Post(':id/composition')
  setComposition(@Param('id') id: string, @Body() dto: SetCompositionDto) {
    return this.matchesService.setComposition(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.COACH)
  @Patch(':id/composition/:compositionId/link')
  linkCompositionGuest(
    @Param('id') id: string,
    @Param('compositionId') compositionId: string,
    @Body() dto: LinkCompositionGuestDto,
  ) {
    return this.matchesService.linkCompositionGuest(id, compositionId, dto.userId);
  }

  @Get(':id/events')
  async getEvents(@Param('id') id: string) {
    const events = await this.matchesService.getEvents(id);
    return events.map((event) => ({
      ...event,
      user: event.user ? sanitizeUser(event.user) : null,
      assistUser: event.assistUser ? sanitizeUser(event.assistUser) : null,
    }));
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.COACH)
  @Post(':id/events')
  addEvent(@Param('id') id: string, @Body() dto: CreateMatchEventDto) {
    return this.matchesService.addEvent(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.COACH)
  @Delete(':id/events/:eventId')
  deleteEvent(@Param('id') id: string, @Param('eventId') eventId: string) {
    return this.matchesService.deleteEvent(id, eventId);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.COACH)
  @Get(':id/ratings')
  async getRatings(@Param('id') id: string) {
    const ratings = await this.matchesService.getRatings(id);
    return ratings.map((r) => ({
      ...r,
      rater: sanitizeUser(r.rater),
      ratedUser: sanitizeUser(r.ratedUser),
    }));
  }

  @Get(':id/ratings/me')
  getMyRatings(@Param('id') id: string, @CurrentUser() currentUser: AuthenticatedUser) {
    return this.matchesService.getMyRatings(id, currentUser.id);
  }

  @Get(':id/ratings/submitted')
  async hasSubmittedRatings(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return { submitted: await this.matchesService.hasSubmittedRatings(id, currentUser.id) };
  }

  @Post(':id/ratings')
  rate(
    @Param('id') id: string,
    @Body() dto: RatePlayerDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.matchesService.rate(id, currentUser.id, dto);
  }

  @Post(':id/ratings/submit')
  submitRatings(
    @Param('id') id: string,
    @Body() dto: SubmitRatingsDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.matchesService.submitRatings(id, currentUser.id, dto);
  }

  @Get(':id/attendance')
  async getAttendance(@Param('id') id: string) {
    const attendances = await this.matchesService.getAttendance(id);
    return attendances.map((a) => ({ ...a, user: sanitizeUser(a.user) }));
  }

  @Put(':id/attendance')
  setMyAttendance(
    @Param('id') id: string,
    @Body() dto: SetAttendanceDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.matchesService.setMyAttendance(id, currentUser.id, dto.status, dto.guests);
  }

  @Get(':id/ratings/summary')
  getRatingsSummary(@Param('id') id: string) {
    return this.matchesService.getRatingsSummary(id);
  }

  @Get(':id/motm')
  getMotm(@Param('id') id: string, @CurrentUser() currentUser: AuthenticatedUser) {
    return this.matchesService.getMotm(id, currentUser.id);
  }

  @Put(':id/motm')
  voteMotm(
    @Param('id') id: string,
    @Body() dto: VoteMotmDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.matchesService.voteMotm(id, currentUser.id, dto.votedForId);
  }

  @Get(':id/defense-boss')
  getDefenseBoss(@Param('id') id: string, @CurrentUser() currentUser: AuthenticatedUser) {
    return this.matchesService.getDefenseBoss(id, currentUser.id);
  }

  @Put(':id/defense-boss')
  voteDefenseBoss(
    @Param('id') id: string,
    @Body() dto: VoteDefenseBossDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.matchesService.voteDefenseBoss(id, currentUser.id, dto.votedForId);
  }
}
