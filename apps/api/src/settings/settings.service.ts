import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { ClubSettings } from './entities/club-settings.entity';
import { UpdateSettingsDto } from './dto/update-settings.dto';

const SETTINGS_ID = 'default';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(ClubSettings)
    private readonly settingsRepository: Repository<ClubSettings>,
  ) {}

  async get(): Promise<ClubSettings> {
    const existing = await this.settingsRepository.findOne({ where: { id: SETTINGS_ID } });
    if (existing) return existing;

    const created = this.settingsRepository.create({ id: SETTINGS_ID, fffTeamUrl: null });
    return this.settingsRepository.save(created);
  }

  async update(dto: UpdateSettingsDto): Promise<ClubSettings> {
    const settings = await this.get();
    Object.assign(settings, dto);
    return this.settingsRepository.save(settings);
  }

  async regenerateJoinToken(): Promise<ClubSettings> {
    const settings = await this.get();
    settings.joinToken = randomUUID();
    return this.settingsRepository.save(settings);
  }

  async disableJoinLink(): Promise<ClubSettings> {
    const settings = await this.get();
    settings.joinToken = null;
    return this.settingsRepository.save(settings);
  }

  async findByJoinToken(token: string): Promise<ClubSettings | null> {
    const settings = await this.settingsRepository.findOne({ where: { id: SETTINGS_ID } });
    if (!settings || !settings.joinToken || settings.joinToken !== token) return null;
    return settings;
  }
}
