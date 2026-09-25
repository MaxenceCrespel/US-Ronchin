import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CoachPlayerRating } from './entities/coach-player-rating.entity';
import { User, UserRole, UserStatus } from './entities/user.entity';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';

export interface PlayerToRate {
  userId: string;
  firstName: string;
  lastName: string;
  rating: number | null;
}

@Injectable()
export class PlayerRatingsService {
  private readonly logger = new Logger(PlayerRatingsService.name);

  constructor(
    @InjectRepository(CoachPlayerRating)
    private readonly ratingsRepository: Repository<CoachPlayerRating>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly pushNotificationsService: PushNotificationsService,
  ) {}

  /** Every active player a coach can rate — everyone but themselves (see
   * CoachPlayerRating's doc comment: coaches never rate their own level) and never a guest
   * or pending account. A playing coach shows up in a teammate's list like any other player,
   * but not in their own. */
  async listForCoach(coachId: string): Promise<PlayerToRate[]> {
    const [users, ratings] = await Promise.all([
      this.usersRepository.find({
        where: [
          { role: UserRole.PLAYER, status: UserStatus.ACTIVE },
          { isPlayingCoach: true, status: UserStatus.ACTIVE },
        ],
      }),
      this.ratingsRepository.find({ where: { coachId } }),
    ]);
    const ratingByPlayerId = new Map(ratings.map((r) => [r.playerId, Number(r.rating)]));
    return users
      .filter((u) => u.id !== coachId)
      .map((u) => ({
        userId: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        rating: ratingByPlayerId.get(u.id) ?? null,
      }));
  }

  async setRating(coachId: string, playerId: string, rating: number): Promise<void> {
    if (coachId === playerId) {
      throw new BadRequestException('Un coach ne peut pas se noter lui-même');
    }
    // Half-points only (1, 1.5, 2, ..., 10) — matches the scale UI, which only ever offers
    // a whole number plus an optional "+½" toggle.
    if (Math.round(rating * 2) !== rating * 2) {
      throw new BadRequestException('La note doit être un multiple de 0,5');
    }
    const player = await this.usersRepository.findOne({ where: { id: playerId } });
    if (!player) throw new NotFoundException('Joueur introuvable');

    const existing = await this.ratingsRepository.findOne({ where: { coachId, playerId } });
    if (existing) {
      existing.rating = rating;
      await this.ratingsRepository.save(existing);
    } else {
      await this.ratingsRepository.save(this.ratingsRepository.create({ coachId, playerId, rating }));
    }
  }

  /** Called right when a player's account is activated (UsersService.approve) — pings only
   * the coaches who'd already rated every OTHER active player, i.e. who were genuinely done
   * before this new arrival. A coach still mid-way through their own list gets the new
   * player folded into their existing "à noter" count instead (no separate ping — the
   * weekly reminder scheduler already covers them). */
  async notifyCoachesOfNewPlayer(newPlayerId: string): Promise<void> {
    const newPlayer = await this.usersRepository.findOne({ where: { id: newPlayerId } });
    if (!newPlayer) return;

    const [coaches, otherActivePlayers, allRatings] = await Promise.all([
      this.usersRepository.find({ where: { role: UserRole.COACH, status: UserStatus.ACTIVE } }),
      this.usersRepository.find({
        where: [
          { role: UserRole.PLAYER, status: UserStatus.ACTIVE },
          { isPlayingCoach: true, status: UserStatus.ACTIVE },
        ],
      }),
      this.ratingsRepository.find(),
    ]);
    const otherIds = otherActivePlayers.map((p) => p.id).filter((id) => id !== newPlayerId);
    const ratedIdsByCoach = new Map<string, Set<string>>();
    for (const r of allRatings) {
      const set = ratedIdsByCoach.get(r.coachId) ?? new Set<string>();
      set.add(r.playerId);
      ratedIdsByCoach.set(r.coachId, set);
    }
    const doneCoachIds = coaches
      .filter((c) => otherIds.every((id) => ratedIdsByCoach.get(c.id)?.has(id)))
      .map((c) => c.id);
    if (doneCoachIds.length === 0) return;

    try {
      await this.pushNotificationsService.sendToUsers(doneCoachIds, {
        title: 'Un nouveau joueur est à noter',
        body: `${newPlayer.firstName} ${newPlayer.lastName} a rejoint l'équipe. Donne-lui une note de 1 à 10.`,
        url: '/player-ratings',
      });
    } catch (error) {
      this.logger.warn(
        `Échec de la notification de nouveau joueur à noter (${newPlayerId}): ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /** Every coach's rating for every player, averaged — the base the skill score starts
   * from (see StatsService.getPlayerStats). Never exposed to a coach for another coach's
   * individual rating, only this aggregate, and only baked into the computed score. */
  async getAverageRatings(): Promise<Map<string, number>> {
    const ratings = await this.ratingsRepository.find();
    const byPlayer = new Map<string, number[]>();
    for (const r of ratings) {
      const list = byPlayer.get(r.playerId) ?? [];
      list.push(Number(r.rating));
      byPlayer.set(r.playerId, list);
    }
    const result = new Map<string, number>();
    for (const [playerId, list] of byPlayer) {
      result.set(playerId, list.reduce((sum, v) => sum + v, 0) / list.length);
    }
    return result;
  }
}
