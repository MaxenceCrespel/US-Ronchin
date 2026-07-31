import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import sharp from 'sharp';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';
import { UserRole } from './entities/user.entity';
import { sanitizeUser as toPublicUser } from '../common/utils/sanitize-user';

const AVATAR_SIZE = 256;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getMe(@CurrentUser() currentUser: AuthenticatedUser) {
    return toPublicUser(await this.usersService.findById(currentUser.id));
  }

  @Patch('me')
  async updateMe(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return toPublicUser(await this.usersService.updateProfile(currentUser.id, dto));
  }

  @Get()
  async findAll() {
    const users = await this.usersService.findAll();
    return users.map(toPublicUser);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.COACH)
  @Patch(':id')
  async adminUpdate(@Param('id') id: string, @Body() dto: AdminUpdateUserDto) {
    return toPublicUser(await this.usersService.adminUpdate(id, dto));
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.COACH)
  @Patch(':id/approve')
  async approve(@Param('id') id: string) {
    return toPublicUser(await this.usersService.approve(id));
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.COACH)
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() currentUser: AuthenticatedUser) {
    await this.usersService.deleteUser(id, currentUser.id);
  }

  @Post('me/avatar')
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  async uploadAvatar(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    if (!file) {
      throw new BadRequestException('Aucune image reçue');
    }
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Le fichier doit être une image');
    }

    const resized = await sharp(file.buffer)
      .rotate()
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover' })
      .jpeg({ quality: 82 })
      .toBuffer()
      .catch(() => {
        throw new BadRequestException('Image invalide ou illisible');
      });

    const dataUri = `data:image/jpeg;base64,${resized.toString('base64')}`;
    return toPublicUser(await this.usersService.setAvatar(currentUser.id, dataUri));
  }

  @Delete('me/avatar')
  async deleteAvatar(@CurrentUser() currentUser: AuthenticatedUser) {
    return toPublicUser(await this.usersService.removeAvatar(currentUser.id));
  }
}
