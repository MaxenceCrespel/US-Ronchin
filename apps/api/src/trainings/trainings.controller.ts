import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { UserRole } from '../users/entities/user.entity';
import { TrainingsService } from './trainings.service';
import { CreateTrainingDto } from './dto/create-training.dto';
import { UpdateTrainingDto } from './dto/update-training.dto';
import { CreateTrainingSessionDto } from './dto/create-training-session.dto';
import { UpdateTrainingSessionDto } from './dto/update-training-session.dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class TrainingsController {
  constructor(private readonly trainingsService: TrainingsService) {}

  @Get('trainings')
  findAllTrainings() {
    return this.trainingsService.findAllTrainings();
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.COACH)
  @Post('trainings')
  createTraining(
    @Body() dto: CreateTrainingDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.trainingsService.createTraining(dto, currentUser.id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.COACH)
  @Patch('trainings/:id')
  updateTraining(@Param('id') id: string, @Body() dto: UpdateTrainingDto) {
    return this.trainingsService.updateTraining(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.COACH)
  @Delete('trainings/:id')
  deleteTraining(@Param('id') id: string) {
    return this.trainingsService.deleteTraining(id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.COACH)
  @Post('trainings/:id/generate-sessions')
  generateSessions(@Param('id') id: string) {
    return this.trainingsService.generateSessions(id);
  }

  @Get('training-sessions')
  findSessions(@Query('from') from?: string, @Query('to') to?: string) {
    return this.trainingsService.findSessionsBetween(from, to);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.COACH)
  @Post('training-sessions')
  createAdHocSession(@Body() dto: CreateTrainingSessionDto) {
    return this.trainingsService.createAdHocSession(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.COACH)
  @Patch('training-sessions/:id')
  updateSession(@Param('id') id: string, @Body() dto: UpdateTrainingSessionDto) {
    return this.trainingsService.updateSession(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.COACH)
  @Delete('training-sessions/:id')
  deleteSession(@Param('id') id: string) {
    return this.trainingsService.deleteSession(id);
  }
}
