import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AwardCategory } from './entities/award-category.entity';
import { AwardVote } from './entities/award-vote.entity';
import { User } from '../users/entities/user.entity';
import { FIXED_AWARD_CATEGORIES } from './fixed-categories';

export interface AwardResultEntry {
  userId: string;
  firstName: string;
  lastName: string;
  votes: number;
}

export interface AwardCategoryResponse {
  id: string;
  key: string;
  title: string;
  isActive: boolean;
  createdAt: Date;
  myVoteUserId: string | null;
  totalVotes: number;
  results: AwardResultEntry[] | null;
}

@Injectable()
export class AwardsService implements OnModuleInit {
  constructor(
    @InjectRepository(AwardCategory)
    private readonly categoriesRepository: Repository<AwardCategory>,
    @InjectRepository(AwardVote)
    private readonly votesRepository: Repository<AwardVote>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  /** Idempotently creates the fixed award categories on boot — this list is not editable. */
  async onModuleInit(): Promise<void> {
    const existing = await this.categoriesRepository.find();
    const existingKeys = new Set(existing.map((c) => c.key));
    const missing = FIXED_AWARD_CATEGORIES.filter((c) => !existingKeys.has(c.key));
    if (missing.length > 0) {
      await this.categoriesRepository.save(missing.map((c) => this.categoriesRepository.create(c)));
    }
  }

  async findAll(currentUserId: string): Promise<AwardCategoryResponse[]> {
    const [categories, votes, users] = await Promise.all([
      this.categoriesRepository.find({ order: { createdAt: 'ASC' } }),
      this.votesRepository.find(),
      this.usersRepository.find(),
    ]);

    return categories.map((category) => {
      const categoryVotes = votes.filter((v) => v.categoryId === category.id);
      const myVote = categoryVotes.find((v) => v.voterId === currentUserId);

      let results: AwardResultEntry[] | null = null;
      if (!category.isActive) {
        const counts = new Map<string, number>();
        for (const vote of categoryVotes) {
          counts.set(vote.votedForId, (counts.get(vote.votedForId) ?? 0) + 1);
        }
        results = [...counts.entries()]
          .map(([userId, count]) => {
            const user = users.find((u) => u.id === userId);
            return {
              userId,
              firstName: user?.firstName ?? '?',
              lastName: user?.lastName ?? '',
              votes: count,
            };
          })
          .sort((a, b) => b.votes - a.votes);
      }

      return {
        id: category.id,
        key: category.key,
        title: category.title,
        isActive: category.isActive,
        createdAt: category.createdAt,
        myVoteUserId: myVote?.votedForId ?? null,
        totalVotes: categoryVotes.length,
        results,
      };
    });
  }

  async findCategoryById(id: string): Promise<AwardCategory> {
    const category = await this.categoriesRepository.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException('Catégorie introuvable');
    }
    return category;
  }

  async setActive(id: string, isActive: boolean): Promise<AwardCategory> {
    const category = await this.findCategoryById(id);
    category.isActive = isActive;
    return this.categoriesRepository.save(category);
  }

  async vote(categoryId: string, voterId: string, votedForId: string): Promise<AwardVote> {
    const category = await this.findCategoryById(categoryId);
    if (!category.isActive) {
      throw new BadRequestException('Le vote pour cette catégorie est clos');
    }

    let vote = await this.votesRepository.findOne({ where: { categoryId, voterId } });
    if (!vote) {
      vote = this.votesRepository.create({ categoryId, voterId, votedForId });
    } else {
      vote.votedForId = votedForId;
    }
    return this.votesRepository.save(vote);
  }
}
