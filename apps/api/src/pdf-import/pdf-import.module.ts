import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MatchPdfImport } from './entities/match-pdf-import.entity';
import { User } from '../users/entities/user.entity';
import { PdfImportService } from './pdf-import.service';
import { PdfImportController } from './pdf-import.controller';

@Module({
  imports: [TypeOrmModule.forFeature([MatchPdfImport, User])],
  controllers: [PdfImportController],
  providers: [PdfImportService],
})
export class PdfImportModule {}
