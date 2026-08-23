import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../users/entities/user.entity';
import { UserActivityDay } from './entities/user-activity-day.entity';

export interface UserActivityKpi {
  userId: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  lastSeenAt: Date | null;
  activeDaysLast7: number;
  activeDaysLast30: number;
  last7Days: boolean[];
}

export interface AdminKpisResponse {
  totalUsers: number;
  activeLast7Days: number;
  activeLast30Days: number;
  players: UserActivityKpi[];
}

const DAY_MS = 86_400_000;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class ActivityTrackingService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(UserActivityDay)
    private readonly activityDaysRepository: Repository<UserActivityDay>,
  ) {}

  /** Fire-and-forget from the global interceptor — never allowed to throw into the request path. */
  async recordActivity(userId: string): Promise<void> {
    const today = isoDate(new Date());
    await Promise.all([
      this.usersRepository.update({ id: userId }, { lastSeenAt: new Date() }),
      this.activityDaysRepository
        .createQueryBuilder()
        .insert()
        .into(UserActivityDay)
        .values({ userId, date: today })
        .orIgnore()
        .execute(),
    ]);
  }

  async getKpis(): Promise<AdminKpisResponse> {
    const since = new Date(Date.now() - 29 * DAY_MS);
    const sinceIso = isoDate(since);

    const [users, allDays] = await Promise.all([
      this.usersRepository.find(),
      this.activityDaysRepository.find(),
    ]);
    const recentDays = allDays.filter((r) => r.date >= sinceIso);

    const daysByUser = new Map<string, Set<string>>();
    for (const row of recentDays) {
      const set = daysByUser.get(row.userId) ?? new Set<string>();
      set.add(row.date);
      daysByUser.set(row.userId, set);
    }

    const last7Dates: string[] = [];
    for (let i = 6; i >= 0; i--) {
      last7Dates.push(isoDate(new Date(Date.now() - i * DAY_MS)));
    }
    const last30Cutoff = isoDate(new Date(Date.now() - 29 * DAY_MS));
    const last7Cutoff = isoDate(new Date(Date.now() - 6 * DAY_MS));

    const players: UserActivityKpi[] = users.map((user) => {
      const activeDates = daysByUser.get(user.id) ?? new Set<string>();
      return {
        userId: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        lastSeenAt: user.lastSeenAt,
        activeDaysLast7: [...activeDates].filter((d) => d >= last7Cutoff).length,
        activeDaysLast30: [...activeDates].filter((d) => d >= last30Cutoff).length,
        last7Days: last7Dates.map((d) => activeDates.has(d)),
      };
    });

    players.sort((a, b) => (a.lastSeenAt?.getTime() ?? 0) - (b.lastSeenAt?.getTime() ?? 0));

    return {
      totalUsers: users.length,
      activeLast7Days: players.filter((p) => p.activeDaysLast7 > 0).length,
      activeLast30Days: players.filter((p) => p.activeDaysLast30 > 0).length,
      players,
    };
  }
}
