import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { UserRole } from '../users/entities/user.entity';
import { PdfImportService } from './pdf-import.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.COACH)
@Controller('matches/pdf-import')
export class PdfImportController {
  constructor(private readonly pdfImportService: PdfImportService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async import(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    if (!file) {
      throw new BadRequestException('Aucun fichier reçu');
    }
    return this.pdfImportService.parseUpload(file.buffer, file.originalname, currentUser.id);
  }
}
