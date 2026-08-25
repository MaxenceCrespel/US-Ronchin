import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Match, MatchSource, MatchStatus } from './entities/match.entity';
import { MatchComposition } from './entities/match-composition.entity';
import { MatchEvent } from './entities/match-event.entity';
import { PlayerRating } from './entities/player-rating.entity';
import { MatchRatingSubmission } from './entities/match-rating-submission.entity';
import { MatchAttendance } from './entities/match-attendance.entity';
import { MatchMotmVote } from './entities/match-motm-vote.entity';
import { MatchDefenseBossVote } from './entities/match-defense-boss-vote.entity';
import { AttendanceStatus } from '../attendances/entities/attendance.entity';
import { PlayerPosition } from '../users/entities/user.entity';
import { CreateMatchDto } from './dto/create-match.dto';
import { UpdateMatchDto } from './dto/update-match.dto';
import { SetCompositionDto } from './dto/set-composition.dto';
import { CreateMatchEventDto } from './dto/create-match-event.dto';
import { RatePlayerDto } from './dto/rate-player.dto';
import { SubmitRatingsDto } from './dto/submit-ratings.dto';
import { isMotmRevealed } from './motm-utils';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';

export interface RatingSummaryEntry {
  userId: string;
  firstName: string;
  lastName: string;
  average: number | null;
  count: number;
}

export interface MotmResultEntry {
  userId: string;
  firstName: string;
  lastName: string;
  votes: number;
}

export interface MotmResponse {
  myVoteUserId: string | null;
  revealed: boolean;
  totalVotes: number;
  totalPlayers: number;
  results: MotmResultEntry[] | null;
}

export interface DefenseBossResultEntry {
  userId: string;
  firstName: string;
  lastName: string;
  votes: number;
}

export interface DefenseBossResponse {
  myVoteUserId: string | null;
  revealed: boolean;
  totalVotes: number;
  totalPlayers: number;
  /** False when no defender played this match — the vote step doesn't apply. */
  hasEligibleTargets: boolean;
  results: DefenseBossResultEntry[] | null;
}

@Injectable()
export class MatchesService {
  constructor(
    @InjectRepository(Match)
    private readonly matchesRepository: Repository<Match>,
    @InjectRepository(MatchComposition)
    private readonly compositionsRepository: Repository<MatchComposition>,
    @InjectRepository(MatchEvent)
    private readonly eventsRepository: Repository<MatchEvent>,
    @InjectRepository(PlayerRating)
    private readonly ratingsRepository: Repository<PlayerRating>,
    @InjectRepository(MatchRatingSubmission)
    private readonly ratingSubmissionsRepository: Repository<MatchRatingSubmission>,
    @InjectRepository(MatchAttendance)
    private readonly attendancesRepository: Repository<MatchAttendance>,
    @InjectRepository(MatchMotmVote)
    private readonly motmVotesRepository: Repository<MatchMotmVote>,
    @InjectRepository(MatchDefenseBossVote)
    private readonly defenseBossVotesRepository: Repository<MatchDefenseBossVote>,
    private readonly pushNotificationsService: PushNotificationsService,
  ) {}

  findAll(): Promise<Match[]> {
    return this.matchesRepository.find({ order: { date: 'DESC' } });
  }

  async findById(id: string): Promise<Match> {
    const match = await this.matchesRepository.findOne({ where: { id } });
    if (!match) {
      throw new NotFoundException('Match introuvable');
    }
    return match;
  }

  create(dto: CreateMatchDto, createdBy: string): Promise<Match> {
    const match = this.matchesRepository.create({
      ...dto,
      source: dto.source ?? MatchSource.FRIENDLY,
      createdBy,
    });
    return this.matchesRepository.save(match);
  }

  async update(id: string, dto: UpdateMatchDto): Promise<Match> {
    const match = await this.findById(id);
    const wasPlayed = match.status === MatchStatus.PLAYED;
    Object.assign(match, dto);
    const saved = await this.matchesRepository.save(match);

    if (!wasPlayed && saved.status === MatchStatus.PLAYED) {
      const composition = await this.getComposition(saved.id);
      await this.pushNotificationsService.sendToUsers(
        composition.map((c) => c.userId).filter((id): id is string => !!id),
        {
          title: 'Match terminé',
          body: `Le match contre ${saved.opponent} est marqué comme joué : votez pour l'homme du match et notez vos coéquipiers.`,
          url: `/matches/${saved.id}`,
        },
      );
    }

    return saved;
  }

  async delete(id: string): Promise<void> {
    await this.findById(id);
    await this.matchesRepository.delete(id);
  }

  getComposition(matchId: string): Promise<MatchComposition[]> {
    return this.compositionsRepository.find({
      where: { matchId },
      relations: { user: true },
    });
  }

  async setComposition(
    matchId: string,
    dto: SetCompositionDto,
  ): Promise<MatchComposition[]> {
    await this.findById(matchId);
    for (const entry of dto.entries) {
      const hasUser = !!entry.userId;
      const hasGuestName = !!entry.guestFirstName && !!entry.guestLastName;
      if (hasUser === hasGuestName) {
        throw new BadRequestException(
          'Chaque joueur doit être soit un compte du club, soit un nom pour un joueur non inscrit',
        );
      }
    }
    await this.compositionsRepository.delete({ matchId });
    const entries = dto.entries.map((entry) =>
      this.compositionsRepository.create({ ...entry, matchId }),
    );
    return this.compositionsRepository.save(entries);
  }

  /** Once a guest composition entry's player creates a real account, the coach can retroactively
   * link the entry to it — the match sheet then counts for that player's stats/badges. */
  async linkCompositionGuest(
    matchId: string,
    compositionId: string,
    userId: string,
  ): Promise<MatchComposition> {
    const entry = await this.compositionsRepository.findOne({
      where: { id: compositionId, matchId },
    });
    if (!entry) {
      throw new NotFoundException('Entrée de composition introuvable');
    }
    if (entry.userId) {
      throw new BadRequestException('Cette entrée est déjà liée à un compte');
    }
    const alreadyComposed = await this.compositionsRepository.findOne({
      where: { matchId, userId },
    });
    if (alreadyComposed) {
      throw new BadRequestException('Ce joueur est déjà dans la composition de ce match');
    }
    entry.userId = userId;
    entry.guestFirstName = null;
    entry.guestLastName = null;
    return this.compositionsRepository.save(entry);
  }

  getEvents(matchId: string): Promise<MatchEvent[]> {
    return this.eventsRepository.find({
      where: { matchId },
      relations: { user: true, assistUser: true },
      order: { minute: 'ASC' },
    });
  }

  async addEvent(matchId: string, dto: CreateMatchEventDto): Promise<MatchEvent> {
    await this.findById(matchId);
    const hasUser = !!dto.userId;
    const hasScorerName = !!dto.scorerName;
    if (hasUser === hasScorerName) {
      throw new BadRequestException(
        'Renseigne soit un joueur du club, soit un nom pour un joueur non inscrit',
      );
    }
    const event = this.eventsRepository.create({ ...dto, matchId });
    return this.eventsRepository.save(event);
  }

  async deleteEvent(matchId: string, eventId: string): Promise<void> {
    const event = await this.eventsRepository.findOne({ where: { id: eventId, matchId } });
    if (!event) {
      throw new NotFoundException('Événement introuvable');
    }
    await this.eventsRepository.delete(eventId);
  }

  getRatings(matchId: string): Promise<PlayerRating[]> {
    return this.ratingsRepository.find({
      where: { matchId },
      relations: { rater: true, ratedUser: true },
    });
  }

  getMyRatings(matchId: string, raterId: string): Promise<PlayerRating[]> {
    return this.ratingsRepository.find({ where: { matchId, raterId } });
  }

  async hasSubmittedRatings(matchId: string, raterId: string): Promise<boolean> {
    const count = await this.ratingSubmissionsRepository.count({ where: { matchId, raterId } });
    return count > 0;
  }

  async rate(matchId: string, raterId: string, dto: RatePlayerDto): Promise<PlayerRating> {
    if (dto.ratedUserId === raterId) {
      throw new BadRequestException('Tu ne peux pas te noter toi-même');
    }
    if (await this.hasSubmittedRatings(matchId, raterId)) {
      throw new BadRequestException('Tes notes sont déjà validées et ne peuvent plus être modifiées');
    }

    const composition = await this.compositionsRepository.find({ where: { matchId } });
    const composedUserIds = new Set(composition.map((entry) => entry.userId));
    if (!composedUserIds.has(raterId) || !composedUserIds.has(dto.ratedUserId)) {
      throw new BadRequestException(
        'Seuls les joueurs ayant participé au match peuvent noter ou être notés',
      );
    }

    let rating = await this.ratingsRepository.findOne({
      where: { matchId, raterId, ratedUserId: dto.ratedUserId },
    });
    if (!rating) {
      rating = this.ratingsRepository.create({
        matchId,
        raterId,
        ratedUserId: dto.ratedUserId,
        rating: dto.rating,
      });
    } else {
      rating.rating = dto.rating;
    }
    return this.ratingsRepository.save(rating);
  }

  /** Rates every teammate at once and locks them — the only way ratings become final. */
  async submitRatings(
    matchId: string,
    raterId: string,
    dto: SubmitRatingsDto,
  ): Promise<PlayerRating[]> {
    if (await this.hasSubmittedRatings(matchId, raterId)) {
      throw new BadRequestException('Tes notes sont déjà validées et ne peuvent plus être modifiées');
    }

    const composition = await this.compositionsRepository.find({ where: { matchId } });
    // Guests (no account yet) can't be rated or rate teammates — excluded from both sides.
    const composedUserIds = new Set(
      composition.map((entry) => entry.userId).filter((id): id is string => !!id),
    );
    const teammateIds = composition
      .map((entry) => entry.userId)
      .filter((userId): userId is string => !!userId && userId !== raterId);

    if (!composedUserIds.has(raterId)) {
      throw new BadRequestException('Seuls les joueurs ayant participé au match peuvent noter');
    }
    const ratedIds = new Set(dto.ratings.map((r) => r.ratedUserId));
    const missing = teammateIds.filter((id) => !ratedIds.has(id));
    if (missing.length > 0) {
      throw new BadRequestException('Il manque des notes pour valider — note tous tes coéquipiers');
    }
    for (const entry of dto.ratings) {
      if (entry.ratedUserId === raterId) {
        throw new BadRequestException('Tu ne peux pas te noter toi-même');
      }
      if (!composedUserIds.has(entry.ratedUserId)) {
        throw new BadRequestException(
          'Seuls les joueurs ayant participé au match peuvent être notés',
        );
      }
    }

    const entities = dto.ratings.map((entry) =>
      this.ratingsRepository.create({
        matchId,
        raterId,
        ratedUserId: entry.ratedUserId,
        rating: entry.rating,
      }),
    );
    await this.ratingsRepository.save(entities);
    await this.ratingSubmissionsRepository.save(
      this.ratingSubmissionsRepository.create({ matchId, raterId }),
    );
    return this.getMyRatings(matchId, raterId);
  }

  getAttendance(matchId: string): Promise<MatchAttendance[]> {
    return this.attendancesRepository.find({
      where: { matchId },
      relations: { user: true },
    });
  }

  async setMyAttendance(
    matchId: string,
    userId: string,
    status: AttendanceStatus,
  ): Promise<MatchAttendance> {
    let attendance = await this.attendancesRepository.findOne({ where: { matchId, userId } });
    if (!attendance) {
      attendance = this.attendancesRepository.create({ matchId, userId, status });
    } else {
      attendance.status = status;
    }
    return this.attendancesRepository.save(attendance);
  }

  /** Live average per rated player — visible to anyone as soon as votes come in, no reveal gating. */
  async getRatingsSummary(matchId: string): Promise<RatingSummaryEntry[]> {
    const [composition, ratings] = await Promise.all([
      this.compositionsRepository.find({ where: { matchId }, relations: { user: true } }),
      this.ratingsRepository.find({ where: { matchId } }),
    ]);

    return composition
      .filter((entry): entry is typeof entry & { userId: string; user: NonNullable<typeof entry.user> } =>
        !!entry.userId && !!entry.user,
      )
      .map((entry) => {
      const entryRatings = ratings.filter((r) => r.ratedUserId === entry.userId);
      const average =
        entryRatings.length > 0
          ? entryRatings.reduce((sum, r) => sum + r.rating, 0) / entryRatings.length
          : null;
      return {
        userId: entry.userId,
        firstName: entry.user.firstName,
        lastName: entry.user.lastName,
        average,
        count: entryRatings.length,
      };
    });
  }

  async getMotm(matchId: string, currentUserId: string): Promise<MotmResponse> {
    const [composition, votes] = await Promise.all([
      this.compositionsRepository.find({ where: { matchId } }),
      this.motmVotesRepository.find({ where: { matchId }, relations: { votedFor: true } }),
    ]);

    // Guests (no account yet) can't vote — excluded from the eligible-voter count that
    // gates when results get revealed.
    const totalPlayers = composition.filter((c) => c.userId).length;
    const totalVotes = votes.length;
    const revealed = isMotmRevealed(votes, totalPlayers);

    let results: MotmResultEntry[] | null = null;
    if (revealed) {
      const counts = new Map<string, MotmResultEntry>();
      for (const vote of votes) {
        const existing = counts.get(vote.votedForId);
        if (existing) {
          existing.votes += 1;
        } else {
          counts.set(vote.votedForId, {
            userId: vote.votedForId,
            firstName: vote.votedFor.firstName,
            lastName: vote.votedFor.lastName,
            votes: 1,
          });
        }
      }
      results = [...counts.values()].sort((a, b) => b.votes - a.votes);
    }

    return {
      myVoteUserId: votes.find((v) => v.voterId === currentUserId)?.votedForId ?? null,
      revealed,
      totalVotes,
      totalPlayers,
      results,
    };
  }

  async voteMotm(matchId: string, voterId: string, votedForId: string): Promise<void> {
    const composition = await this.compositionsRepository.find({ where: { matchId } });
    const composedUserIds = new Set(composition.map((entry) => entry.userId));
    if (!composedUserIds.has(voterId) || !composedUserIds.has(votedForId)) {
      throw new BadRequestException(
        'Seuls les joueurs ayant participé au match peuvent voter ou être élus',
      );
    }

    const { revealed } = await this.getMotm(matchId, voterId);
    if (revealed) {
      throw new BadRequestException('Le vote homme du match est clos pour ce match');
    }

    const existing = await this.motmVotesRepository.findOne({ where: { matchId, voterId } });
    if (existing) {
      throw new BadRequestException('Ton vote est déjà enregistré et ne peut plus être modifié');
    }
    const vote = this.motmVotesRepository.create({ matchId, voterId, votedForId });
    await this.motmVotesRepository.save(vote);
  }

  async getDefenseBoss(matchId: string, currentUserId: string): Promise<DefenseBossResponse> {
    const [composition, votes] = await Promise.all([
      this.compositionsRepository.find({ where: { matchId } }),
      this.defenseBossVotesRepository.find({ where: { matchId }, relations: { votedFor: true } }),
    ]);

    // Guests (no account yet) can't vote — excluded from the eligible-voter count that
    // gates when results get revealed.
    const totalPlayers = composition.filter((c) => c.userId).length;
    const totalVotes = votes.length;
    const hasEligibleTargets = composition.some((c) => c.position === PlayerPosition.DEFENDER);
    const revealed = isMotmRevealed(votes, totalPlayers);

    let results: DefenseBossResultEntry[] | null = null;
    if (revealed) {
      const counts = new Map<string, DefenseBossResultEntry>();
      for (const vote of votes) {
        const existing = counts.get(vote.votedForId);
        if (existing) {
          existing.votes += 1;
        } else {
          counts.set(vote.votedForId, {
            userId: vote.votedForId,
            firstName: vote.votedFor.firstName,
            lastName: vote.votedFor.lastName,
            votes: 1,
          });
        }
      }
      results = [...counts.values()].sort((a, b) => b.votes - a.votes);
    }

    return {
      myVoteUserId: votes.find((v) => v.voterId === currentUserId)?.votedForId ?? null,
      revealed,
      totalVotes,
      totalPlayers,
      hasEligibleTargets,
      results,
    };
  }

  async voteDefenseBoss(matchId: string, voterId: string, votedForId: string): Promise<void> {
    const composition = await this.compositionsRepository.find({ where: { matchId } });
    const composedUserIds = new Set(composition.map((entry) => entry.userId));
    if (!composedUserIds.has(voterId)) {
      throw new BadRequestException('Seuls les joueurs ayant participé au match peuvent voter');
    }
    const target = composition.find((entry) => entry.userId === votedForId);
    if (!target || target.position !== PlayerPosition.DEFENDER) {
      throw new BadRequestException('Seul un défenseur du match peut être élu patron de la défense');
    }

    const { revealed } = await this.getDefenseBoss(matchId, voterId);
    if (revealed) {
      throw new BadRequestException('Le vote patron de la défense est clos pour ce match');
    }

    const existing = await this.defenseBossVotesRepository.findOne({ where: { matchId, voterId } });
    if (existing) {
      throw new BadRequestException('Ton vote est déjà enregistré et ne peut plus être modifié');
    }
    const vote = this.defenseBossVotesRepository.create({ matchId, voterId, votedForId });
    await this.defenseBossVotesRepository.save(vote);
  }
}
