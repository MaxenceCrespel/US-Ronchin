import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AwardCategory } from './entities/award-category.entity';
import { AwardVote } from './entities/award-vote.entity';
import { User } from '../users/entities/user.entity';
import { AwardsService } from './awards.service';
import { AwardsController } from './awards.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AwardCategory, AwardVote, User])],
  controllers: [AwardsController],
  providers: [AwardsService],
})
export class AwardsModule {}
