import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Match, MatchSource, MatchStatus } from './entities/match.entity';
import { MatchComposition } from './entities/match-composition.entity';
import { MatchEvent } from './entities/match-event.entity';
import { PlayerRating } from './entities/player-rating.entity';
import { MatchRatingSubmission } from './entities/match-rating-submission.entity';
import { MatchAttendance } from './entities/match-attendance.entity';
import { MatchAttendanceGuest } from './entities/match-attendance-guest.entity';
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
import { isMotmRevealed, firstVoteAt, MOTM_REVEAL_DELAY_MS } from './motm-utils';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';

export interface RatingSummaryEntry {
  /** Null when the rated player is still a guest (no account linked yet). */
  userId: string | null;
  /** Stable key regardless of userId/guest status — the composition entry's own id. */
  compositionId: string;
  firstName: string;
  lastName: string;
  average: number | null;
  count: number;
}

export interface MotmResultEntry {
  /** Null when the winner is still a guest (no account linked yet). */
  userId: string | null;
  firstName: string;
  lastName: string;
  votes: number;
}

export interface MotmResponse {
  myVoteCompositionId: string | null;
  revealed: boolean;
  totalVotes: number;
  totalPlayers: number;
  /** When the 24h reveal window closes — null until the first vote is cast. */
  votingClosesAt: string | null;
  results: MotmResultEntry[] | null;
}

export interface DefenseBossResultEntry {
  /** Null when the winner is still a guest (no account linked yet). */
  userId: string | null;
  firstName: string;
  lastName: string;
  votes: number;
}

export interface DefenseBossResponse {
  myVoteCompositionId: string | null;
  revealed: boolean;
  totalVotes: number;
  totalPlayers: number;
  /** When the 24h reveal window closes — null until the first vote is cast. */
  votingClosesAt: string | null;
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
    @InjectRepository(MatchAttendanceGuest)
    private readonly matchAttendanceGuestsRepository: Repository<MatchAttendanceGuest>,
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
    const wasConfirmed = match.resultConfirmedAt !== null;
    const { resultConfirmed, ...rest } = dto;
    Object.assign(match, rest);
    if (resultConfirmed) {
      match.resultConfirmedAt = new Date();
    }
    const saved = await this.matchesRepository.save(match);

    // Fires once the coach has actually finished the whole setup (composition AND events),
    // not as soon as status flips to PLAYED — that happens as early as the score-entry step,
    // well before scorers/cards even exist, which used to open voting prematurely.
    if (!wasConfirmed && saved.resultConfirmedAt !== null) {
      const composition = await this.getComposition(saved.id);
      await this.pushNotificationsService.sendToUsers(
        composition.map((c) => c.userId).filter((id): id is string => !!id),
        {
          title: 'Match terminé',
          body: `Le match contre ${saved.opponent} est marqué comme joué : votez pour l'homme du match, le patron de la défense, et notez vos coéquipiers.`,
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
    // Upsert rather than delete-then-recreate: matches/motm/defense-boss votes are FK'd to
    // a composition row (so a guest's vote survives being linked to a real account later),
    // and blindly recreating every row on each save would cascade-delete those votes.
    const existing = await this.compositionsRepository.find({ where: { matchId } });
    const existingById = new Map(existing.map((e) => [e.id, e]));
    const existingByUserId = new Map(
      existing
        .filter((e): e is MatchComposition & { userId: string } => !!e.userId)
        .map((e) => [e.userId, e]),
    );

    const keepIds = new Set<string>();
    const toSave = dto.entries.map((entry) => {
      const matched =
        (entry.id ? existingById.get(entry.id) : undefined) ??
        (entry.userId ? existingByUserId.get(entry.userId) : undefined);
      if (matched) {
        keepIds.add(matched.id);
        return this.compositionsRepository.merge(matched, entry);
      }
      return this.compositionsRepository.create({ ...entry, matchId });
    });

    const toDeleteIds = existing.filter((e) => !keepIds.has(e.id)).map((e) => e.id);
    if (toDeleteIds.length > 0) {
      await this.compositionsRepository.delete(toDeleteIds);
    }
    return this.compositionsRepository.save(toSave);
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

  /** Composition entries (besides the rater) not yet rated BY this rater — covers both a
   * first-time visit (nothing rated yet) and a teammate added to the composition after the
   * rater already validated once (only that new teammate is pending). Matched the same way
   * as getRatingsSummary: by whichever field each rating row actually has set, so a guest
   * linked to a real account after being rated doesn't spuriously reappear as "pending". */
  async getPendingRatingTargets(matchId: string, raterId: string): Promise<string[]> {
    const [composition, myRatings] = await Promise.all([
      this.compositionsRepository.find({ where: { matchId } }),
      this.ratingsRepository.find({ where: { matchId, raterId } }),
    ]);
    return composition
      .filter((entry) => entry.userId !== raterId)
      .filter(
        (entry) =>
          !myRatings.some(
            (r) => (entry.userId && r.ratedUserId === entry.userId) || r.ratedGuestId === entry.id,
          ),
      )
      .map((entry) => entry.id);
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

  /** Rates every currently-pending teammate at once and locks them in — a rating once saved
   * can never be changed. Callable more than once per match: if the coach adds a new teammate
   * to the composition after this rater already validated, only that new teammate is pending
   * next time around (see getPendingRatingTargets) — everyone already rated is untouched and
   * can't be re-submitted. */
  async submitRatings(
    matchId: string,
    raterId: string,
    dto: SubmitRatingsDto,
  ): Promise<PlayerRating[]> {
    const composition = await this.compositionsRepository.find({ where: { matchId } });
    // A guest (no account yet) can be rated — the coach adds real people who happen not to
    // have created an account, they still played and deserve a note like anyone else — but
    // can't rate teammates themselves, since rating requires being logged in as someone.
    const composedUserIds = new Set(
      composition.map((entry) => entry.userId).filter((id): id is string => !!id),
    );
    const composedGuestIds = new Set(
      composition.filter((entry) => !entry.userId).map((entry) => entry.id),
    );

    if (!composedUserIds.has(raterId)) {
      throw new BadRequestException('Seuls les joueurs ayant participé au match peuvent noter');
    }

    const pendingCompositionIds = new Set(await this.getPendingRatingTargets(matchId, raterId));
    if (pendingCompositionIds.size === 0) {
      throw new BadRequestException('Tes notes sont déjà à jour pour ce match');
    }
    // Each pending teammate, identified consistently with dto.ratings entries: a real
    // account by userId, a guest by their composition row id.
    const pendingTargets = new Set(
      composition
        .filter((entry) => pendingCompositionIds.has(entry.id))
        .map((entry) => entry.userId ?? entry.id),
    );

    const ratedTargets = new Set(dto.ratings.map((r) => r.ratedUserId ?? r.ratedGuestId));
    const missing = [...pendingTargets].filter((id) => !ratedTargets.has(id));
    if (missing.length > 0) {
      throw new BadRequestException('Il manque des notes pour valider — note tous tes coéquipiers');
    }
    for (const entry of dto.ratings) {
      if ((entry.ratedUserId == null) === (entry.ratedGuestId == null)) {
        throw new BadRequestException(
          'Chaque note doit cibler exactement un joueur ou un invité',
        );
      }
      if (entry.ratedUserId === raterId) {
        throw new BadRequestException('Tu ne peux pas te noter toi-même');
      }
      if (entry.ratedUserId && !composedUserIds.has(entry.ratedUserId)) {
        throw new BadRequestException(
          'Seuls les joueurs ayant participé au match peuvent être notés',
        );
      }
      if (entry.ratedGuestId && !composedGuestIds.has(entry.ratedGuestId)) {
        throw new BadRequestException(
          'Seuls les joueurs ayant participé au match peuvent être notés',
        );
      }
      // Exactly one of ratedUserId/ratedGuestId is guaranteed set by the check just above.
      const target = (entry.ratedUserId ?? entry.ratedGuestId)!;
      if (!pendingTargets.has(target)) {
        throw new BadRequestException('Ce joueur a déjà été noté et ne peut plus être modifié');
      }
    }

    const entities = dto.ratings.map((entry) =>
      this.ratingsRepository.create({
        matchId,
        raterId,
        ratedUserId: entry.ratedUserId ?? null,
        ratedGuestId: entry.ratedGuestId ?? null,
        rating: entry.rating,
      }),
    );
    await this.ratingsRepository.save(entities);
    if (!(await this.hasSubmittedRatings(matchId, raterId))) {
      await this.ratingSubmissionsRepository.save(
        this.ratingSubmissionsRepository.create({ matchId, raterId }),
      );
    }
    return this.getMyRatings(matchId, raterId);
  }

  getAttendance(matchId: string): Promise<MatchAttendance[]> {
    return this.attendancesRepository.find({
      where: { matchId },
      relations: { user: true, guests: true },
    });
  }

  async setMyAttendance(
    matchId: string,
    userId: string,
    status: AttendanceStatus,
    guests: { firstName: string; lastName?: string }[] = [],
  ): Promise<MatchAttendance> {
    const match = await this.findById(matchId);
    const hasKickedOff =
      new Date(`${match.date}T${match.kickOffTime ?? '00:00:00'}`).getTime() <= Date.now();
    if (hasKickedOff) {
      throw new BadRequestException(
        'Le match a déjà commencé, tu ne peux plus modifier ta présence',
      );
    }
    // A guest only makes sense for a friendly — an officially licensed match can't field
    // someone informal. Rejected outright rather than silently dropped, so a stale UI state
    // doesn't quietly lose someone's declared +1.
    if (guests.length > 0 && match.source !== MatchSource.FRIENDLY) {
      throw new BadRequestException(
        "Impossible d'ajouter un invité — ce match n'est pas un match amical",
      );
    }

    let attendance = await this.attendancesRepository.findOne({ where: { matchId, userId } });
    if (!attendance) {
      attendance = this.attendancesRepository.create({
        matchId,
        userId,
        status,
        guestCount: guests.length,
      });
    } else {
      attendance.status = status;
      attendance.guestCount = guests.length;
    }
    attendance = await this.attendancesRepository.save(attendance);

    await this.matchAttendanceGuestsRepository.delete({ matchAttendanceId: attendance.id });
    attendance.guests = guests.length
      ? await this.matchAttendanceGuestsRepository.save(
          guests.map((g) =>
            this.matchAttendanceGuestsRepository.create({
              matchAttendanceId: attendance!.id,
              firstName: g.firstName,
              lastName: g.lastName ?? null,
            }),
          ),
        )
      : [];

    return attendance;
  }

  /** Live average per rated player — visible to anyone as soon as votes come in, no reveal gating. */
  async getRatingsSummary(matchId: string): Promise<RatingSummaryEntry[]> {
    const [composition, ratings] = await Promise.all([
      this.compositionsRepository.find({ where: { matchId }, relations: { user: true } }),
      this.ratingsRepository.find({ where: { matchId } }),
    ]);

    return composition.map((entry) => {
      // Match by whichever field is actually set on each rating row, not by the
      // composition entry's *current* link state — a rating cast before the coach links a
      // guest to a real account is stored with ratedGuestId, and stays that way forever
      // (rating rows aren't rewritten on link). Checking only ratedUserId once entry.userId
      // is set would silently drop every rating given before the link. Same principle as
      // MOTM's voteTarget, which already gets this right.
      const entryRatings = ratings.filter(
        (r) => (entry.userId && r.ratedUserId === entry.userId) || r.ratedGuestId === entry.id,
      );
      const average =
        entryRatings.length > 0
          ? entryRatings.reduce((sum, r) => sum + r.rating, 0) / entryRatings.length
          : null;
      return {
        userId: entry.userId,
        compositionId: entry.id,
        firstName: entry.user?.firstName ?? entry.guestFirstName ?? '',
        lastName: entry.user?.lastName ?? entry.guestLastName ?? '',
        average,
        count: entryRatings.length,
      };
    });
  }

  async getMotm(matchId: string, currentUserId: string): Promise<MotmResponse> {
    const [match, composition, votes] = await Promise.all([
      this.findById(matchId),
      this.compositionsRepository.find({ where: { matchId }, relations: { user: true } }),
      this.motmVotesRepository.find({ where: { matchId } }),
    ]);

    // Not open yet — the coach hasn't finished the composition/events setup, so voting
    // shouldn't appear available (or its progress gauge show up) anywhere in the app, even
    // though the composition itself may already exist from an earlier wizard step.
    if (match.resultConfirmedAt === null) {
      return { myVoteCompositionId: null, revealed: false, totalVotes: 0, totalPlayers: 0, votingClosesAt: null, results: null };
    }

    // Guests (no account yet) can't vote — excluded from the eligible-voter count that
    // gates when results get revealed.
    const totalPlayers = composition.filter((c) => c.userId).length;
    const totalVotes = votes.length;
    const revealed = isMotmRevealed(votes, totalPlayers);
    const first = firstVoteAt(votes);
    const votingClosesAt = first ? new Date(first.getTime() + MOTM_REVEAL_DELAY_MS).toISOString() : null;
    const compositionById = new Map(composition.map((c) => [c.id, c]));
    const compositionByUserId = new Map(
      composition.filter((c): c is MatchComposition & { userId: string } => !!c.userId).map((c) => [c.userId, c]),
    );
    // The composition entry each vote targets, real account or guest alike.
    const voteTarget = (v: MatchMotmVote) =>
      v.votedForGuestId ? compositionById.get(v.votedForGuestId) : compositionByUserId.get(v.votedForId!);

    let results: MotmResultEntry[] | null = null;
    if (revealed) {
      const counts = new Map<string, MotmResultEntry>();
      for (const vote of votes) {
        const target = voteTarget(vote);
        if (!target) continue;
        const key = target.id;
        const existing = counts.get(key);
        if (existing) {
          existing.votes += 1;
        } else {
          counts.set(key, {
            userId: target.userId,
            firstName: target.user?.firstName ?? target.guestFirstName ?? '',
            lastName: target.user?.lastName ?? target.guestLastName ?? '',
            votes: 1,
          });
        }
      }
      results = [...counts.values()].sort((a, b) => b.votes - a.votes);
    }

    const myVote = votes.find((v) => v.voterId === currentUserId);
    return {
      myVoteCompositionId: myVote ? (voteTarget(myVote)?.id ?? null) : null,
      revealed,
      totalVotes,
      totalPlayers,
      votingClosesAt,
      results,
    };
  }

  /** votedForCompositionId targets a MatchComposition row, not a User directly — a vote for
   * a guest (no account yet) is valid and automatically resolves to a real player once the
   * coach links that entry (see linkCompositionGuest). Only the voter must be a real account. */
  async voteMotm(matchId: string, voterId: string, votedForCompositionId: string): Promise<void> {
    const composition = await this.compositionsRepository.find({ where: { matchId } });
    const composedUserIds = new Set(composition.map((entry) => entry.userId));
    const target = composition.find((entry) => entry.id === votedForCompositionId);
    if (!composedUserIds.has(voterId) || !target) {
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
    const vote = this.motmVotesRepository.create({
      matchId,
      voterId,
      votedForId: target.userId ?? null,
      votedForGuestId: target.userId ? null : target.id,
    });
    await this.motmVotesRepository.save(vote);
  }

  async getDefenseBoss(matchId: string, currentUserId: string): Promise<DefenseBossResponse> {
    const [match, composition, votes] = await Promise.all([
      this.findById(matchId),
      this.compositionsRepository.find({ where: { matchId }, relations: { user: true } }),
      this.defenseBossVotesRepository.find({ where: { matchId } }),
    ]);

    // Not open yet — see getMotm above for why.
    if (match.resultConfirmedAt === null) {
      return {
        myVoteCompositionId: null,
        revealed: false,
        totalVotes: 0,
        totalPlayers: 0,
        votingClosesAt: null,
        hasEligibleTargets: true,
        results: null,
      };
    }

    // Guests (no account yet) can't vote — excluded from the eligible-voter count that
    // gates when results get revealed.
    const totalPlayers = composition.filter((c) => c.userId).length;
    const totalVotes = votes.length;
    const hasEligibleTargets = composition.some((c) => c.position === PlayerPosition.DEFENDER);
    const revealed = isMotmRevealed(votes, totalPlayers);
    const first = firstVoteAt(votes);
    const votingClosesAt = first ? new Date(first.getTime() + MOTM_REVEAL_DELAY_MS).toISOString() : null;
    const compositionById = new Map(composition.map((c) => [c.id, c]));
    const compositionByUserId = new Map(
      composition.filter((c): c is MatchComposition & { userId: string } => !!c.userId).map((c) => [c.userId, c]),
    );
    const voteTarget = (v: MatchDefenseBossVote) =>
      v.votedForGuestId ? compositionById.get(v.votedForGuestId) : compositionByUserId.get(v.votedForId!);

    let results: DefenseBossResultEntry[] | null = null;
    if (revealed) {
      const counts = new Map<string, DefenseBossResultEntry>();
      for (const vote of votes) {
        const target = voteTarget(vote);
        if (!target) continue;
        const key = target.id;
        const existing = counts.get(key);
        if (existing) {
          existing.votes += 1;
        } else {
          counts.set(key, {
            userId: target.userId,
            firstName: target.user?.firstName ?? target.guestFirstName ?? '',
            lastName: target.user?.lastName ?? target.guestLastName ?? '',
            votes: 1,
          });
        }
      }
      results = [...counts.values()].sort((a, b) => b.votes - a.votes);
    }

    const myVote = votes.find((v) => v.voterId === currentUserId);
    return {
      myVoteCompositionId: myVote ? (voteTarget(myVote)?.id ?? null) : null,
      revealed,
      totalVotes,
      totalPlayers,
      votingClosesAt,
      hasEligibleTargets,
      results,
    };
  }

  async voteDefenseBoss(
    matchId: string,
    voterId: string,
    votedForCompositionId: string,
  ): Promise<void> {
    const composition = await this.compositionsRepository.find({ where: { matchId } });
    const composedUserIds = new Set(composition.map((entry) => entry.userId));
    if (!composedUserIds.has(voterId)) {
      throw new BadRequestException('Seuls les joueurs ayant participé au match peuvent voter');
    }
    const target = composition.find((entry) => entry.id === votedForCompositionId);
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
    const vote = this.defenseBossVotesRepository.create({
      matchId,
      voterId,
      votedForId: target.userId ?? null,
      votedForGuestId: target.userId ? null : target.id,
    });
    await this.defenseBossVotesRepository.save(vote);
  }
}
