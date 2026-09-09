import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlayerSeparationRule } from './entities/player-separation-rule.entity';

export interface SeparationRuleView {
  id: string;
  otherUserId: string;
  otherUserFirstName: string;
  otherUserLastName: string;
  createdAt: Date;
}

export interface SeparationRulePairView {
  id: string;
  userAId: string;
  userAFirstName: string;
  userALastName: string;
  userBId: string;
  userBFirstName: string;
  userBLastName: string;
  createdAt: Date;
}

@Injectable()
export class PlayerSeparationRulesService {
  constructor(
    @InjectRepository(PlayerSeparationRule)
    private readonly rulesRepository: Repository<PlayerSeparationRule>,
  ) {}

  /** For TeamBalancingService.generateTeams — just the pairs, no need for user relations. */
  async findAllPairs(): Promise<{ userAId: string; userBId: string }[]> {
    const rules = await this.rulesRepository.find();
    return rules.map((r) => ({ userAId: r.userAId, userBId: r.userBId }));
  }

  /** Every rule club-wide, both names attached — for the admin dashboard's global list,
   * distinct from findForUser's single-player, "who am I separated from" view. */
  async findAll(): Promise<SeparationRulePairView[]> {
    const rules = await this.rulesRepository.find({
      relations: { userA: true, userB: true },
      order: { createdAt: 'DESC' },
    });
    return rules.map((r) => ({
      id: r.id,
      userAId: r.userAId,
      userAFirstName: r.userA.firstName,
      userALastName: r.userA.lastName,
      userBId: r.userBId,
      userBFirstName: r.userB.firstName,
      userBLastName: r.userB.lastName,
      createdAt: r.createdAt,
    }));
  }

  async findForUser(userId: string): Promise<SeparationRuleView[]> {
    const rules = await this.rulesRepository.find({
      where: [{ userAId: userId }, { userBId: userId }],
      relations: { userA: true, userB: true },
    });
    return rules.map((r) => {
      const other = r.userAId === userId ? r.userB : r.userA;
      return {
        id: r.id,
        otherUserId: other.id,
        otherUserFirstName: other.firstName,
        otherUserLastName: other.lastName,
        createdAt: r.createdAt,
      };
    });
  }

  async create(userAId: string, userBId: string): Promise<void> {
    if (userAId === userBId) {
      throw new BadRequestException('Un joueur ne peut pas être incompatible avec lui-même');
    }
    // Canonical order so (A,B) and (B,A) can't both exist as separate rows.
    const [first, second] = [userAId, userBId].sort();
    const existing = await this.rulesRepository.findOne({
      where: { userAId: first, userBId: second },
    });
    if (existing) {
      throw new ConflictException('Cette règle existe déjà');
    }
    await this.rulesRepository.save(
      this.rulesRepository.create({ userAId: first, userBId: second }),
    );
  }

  async remove(id: string): Promise<void> {
    const result = await this.rulesRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('Règle introuvable');
    }
  }
}
