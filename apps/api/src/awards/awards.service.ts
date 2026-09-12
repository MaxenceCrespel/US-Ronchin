import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AwardCategory } from './entities/award-category.entity';
import { AwardVote } from './entities/award-vote.entity';
import { User, UserRole, UserStatus } from '../users/entities/user.entity';
import { getCurrentSeasonLabel } from '../stats/season.util';
import { MONTHLY_AWARD_KEYS } from './monthly-award.constant';
import { monthLabelDisplay } from './month.util';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';

/** The `season` column doubles as a season label ("2026-2027") for the 5 end-of-season
 * categories and a month label ("2026-09") for the monthly ones — this is the one place that
 * needs to tell which kind of period it's looking at, to phrase the "results are in" push
 * appropriately. A season label always has two 4-digit years; a month label one 4-digit year
 * and a 2-digit month. */
function isSeasonLabel(period: string): boolean {
  return /^\d{4}-\d{4}$/.test(period);
}

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
  season: string | null;
  isActive: boolean;
  closedAt: Date | null;
  createdAt: Date;
  myVoteUserId: string | null;
  totalVotes: number;
  results: AwardResultEntry[] | null;
}

/** True for anyone the mandatory-vote gate applies to — regular players, and a coach who
 * also plays — same rule as the frontend's isRosterPlayer, only counting active accounts
 * (a still-pending signup isn't forced to vote and doesn't hold up the whole roster). */
function isRosterPlayer(user: User): boolean {
  return user.status === UserStatus.ACTIVE && (user.role === UserRole.PLAYER || user.isPlayingCoach);
}

@Injectable()
export class AwardsService {
  constructor(
    @InjectRepository(AwardCategory)
    private readonly categoriesRepository: Repository<AwardCategory>,
    @InjectRepository(AwardVote)
    private readonly votesRepository: Repository<AwardVote>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly pushNotificationsService: PushNotificationsService,
  ) {}

  /** Only this season's categories — AwardsScheduler opens a fresh row per fixed key every
   * June, so a past season's rows stay in the table as history but never show up here.
   * Results are only computed for a closed category — while voting is open, nobody
   * (including the voter themselves) can see a running tally. */
  async findAll(currentUserId: string): Promise<AwardCategoryResponse[]> {
    const season = getCurrentSeasonLabel();
    const [categories, votes, users] = await Promise.all([
      this.categoriesRepository.find({ where: { season }, order: { createdAt: 'ASC' } }),
      this.votesRepository.find(),
      this.usersRepository.find(),
    ]);

    return categories.map((category) => this.buildResponse(category, votes, users, currentUserId));
  }

  /** The month's fixed categories ("Joueur du mois") — same category/vote mechanism as the
   * season awards (see
   * FIXED_MONTHLY_AWARD_CATEGORIES, opened/closed together every month by
   * MonthlyAwardScheduler), just scoped by a "YYYY-MM" month instead of a season. `current`
   * is however many of this month's rows are still open (several at once, normally — they
   * all open and close together); `history` is every past month's closed rows, most recent
   * first, each carrying its winner once closed — the trophy case's data source. */
  async findMonthly(
    currentUserId: string,
  ): Promise<{ current: AwardCategoryResponse[]; history: AwardCategoryResponse[] }> {
    const [categories, users] = await Promise.all([
      this.categoriesRepository.find({ where: { key: In(MONTHLY_AWARD_KEYS) }, order: { season: 'DESC' } }),
      this.usersRepository.find(),
    ]);
    if (categories.length === 0) return { current: [], history: [] };

    const votes = await this.votesRepository.find({
      where: categories.map((c) => ({ categoryId: c.id })),
    });

    const responses = categories.map((category) => this.buildResponse(category, votes, users, currentUserId));
    const current = responses.filter((r) => r.isActive);
    const history = responses.filter((r) => !r.isActive);
    return { current, history };
  }

  private buildResponse(
    category: AwardCategory,
    votes: AwardVote[],
    users: User[],
    currentUserId: string,
  ): AwardCategoryResponse {
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
      season: category.season,
      isActive: category.isActive,
      closedAt: category.closedAt,
      createdAt: category.createdAt,
      myVoteUserId: myVote?.votedForId ?? null,
      totalVotes: categoryVotes.length,
      results,
    };
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
    category.closedAt = isActive ? null : new Date();
    return this.categoriesRepository.save(category);
  }

  async vote(categoryId: string, voterId: string, votedForId: string): Promise<AwardVote> {
    if (votedForId === voterId) {
      throw new BadRequestException('On ne vote pas pour soi-même');
    }
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
    const saved = await this.votesRepository.save(vote);

    if (category.season) {
      await this.maybeCloseSeasonEarly(category.season);
    }

    return saved;
  }

  /** Fires after every vote — the instant every roster player has voted in every active
   * category of the season, there's nothing left to wait for, so close the whole season
   * right then instead of leaving it open until the 16 June backstop. */
  private async maybeCloseSeasonEarly(season: string): Promise<void> {
    const [activeCategories, users] = await Promise.all([
      this.categoriesRepository.find({ where: { season, isActive: true } }),
      this.usersRepository.find(),
    ]);
    if (activeCategories.length === 0) return;

    const roster = users.filter(isRosterPlayer);
    if (roster.length === 0) return;

    const votes = await this.votesRepository.find({
      where: activeCategories.map((c) => ({ categoryId: c.id })),
    });

    const everyoneVotedEverywhere = activeCategories.every((category) => {
      const voterIds = new Set(votes.filter((v) => v.categoryId === category.id).map((v) => v.voterId));
      return roster.every((player) => voterIds.has(player.id));
    });
    if (!everyoneVotedEverywhere) return;

    const now = new Date();
    for (const category of activeCategories) {
      category.isActive = false;
      category.closedAt = now;
    }
    await this.categoriesRepository.save(activeCategories);

    const recipientIds = roster.map((p) => p.id);
    if (isSeasonLabel(season)) {
      await this.pushNotificationsService.sendToUsers(recipientIds, {
        title: 'Trophées de la saison dévoilés',
        body: `Les résultats des trophées de fin de saison ${season} sont prêts — viens découvrir qui a gagné !`,
        url: '/',
      });
    } else {
      await this.pushNotificationsService.sendToUsers(recipientIds, {
        title: 'Joueur du mois dévoilé',
        body: `Viens découvrir si tu as été élu Joueur du mois de ${monthLabelDisplay(season)} !`,
        url: '/',
      });
    }
  }
}
