import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole, UserStatus } from '../users/entities/user.entity';
import { PushSubscription } from '../push-notifications/entities/push-subscription.entity';
import { UserActivityDay } from './entities/user-activity-day.entity';

export interface UserActivityKpi {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
  lastSeenAt: Date | null;
  loginCount: number;
  activeDaysLast7: number;
  activeDaysLast30: number;
  activeDaysAllTime: number;
  last7Days: boolean[];
  pwaInstalled: boolean;
  pwaInstalledAt: Date | null;
  notificationsEnabled: boolean;
}

export interface AdminKpisResponse {
  totalUsers: number;
  activeLast7Days: number;
  activeLast30Days: number;
  players: UserActivityKpi[];
}

const DAY_MS = 86_400_000;
// A gap longer than this since their last request counts as coming back for a new
// "connexion" — chosen to tell "genuinely came back later" apart from "kept a tab open
// across a short break", without requiring an actual re-login (a still-valid refresh token
// silently renews the session forever otherwise, so a raw login-event count would badly
// undercount anyone who rarely logs out — see AuthService.login, which no longer
// increments this directly).
const SESSION_GAP_MS = 4 * 60 * 60 * 1000; // 4 hours

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
    @InjectRepository(PushSubscription)
    private readonly pushSubscriptionsRepository: Repository<PushSubscription>,
  ) {}

  /** Fire-and-forget from the global interceptor — never allowed to throw into the request
   * path. Detects a "new connexion" the same passive way activeDays already works: no
   * explicit login required, just a real gap since they were last seen. */
  async recordActivity(userId: string): Promise<void> {
    const now = new Date();
    const today = isoDate(now);

    const user = await this.usersRepository.findOne({ where: { id: userId } });
    const isNewSession =
      !user?.lastSeenAt || now.getTime() - user.lastSeenAt.getTime() > SESSION_GAP_MS;

    await Promise.all([
      this.usersRepository
        .createQueryBuilder()
        .update(User)
        .set({
          lastSeenAt: now,
          ...(isNewSession ? { loginCount: () => '"login_count" + 1' } : {}),
        })
        .where('id = :userId', { userId })
        .execute(),
      this.activityDaysRepository
        .createQueryBuilder()
        .insert()
        .into(UserActivityDay)
        .values({ userId, date: today })
        .orIgnore()
        .execute(),
    ]);
  }

  /** Client self-reports once it detects standalone/installed display mode (see
   * InstallAppBanner.tsx) — a no-op once already recorded. */
  async recordPwaInstall(userId: string): Promise<void> {
    await this.usersRepository
      .createQueryBuilder()
      .update(User)
      .set({ pwaInstalledAt: () => 'COALESCE(pwa_installed_at, now())' })
      .where('id = :userId', { userId })
      .execute();
  }

  async getKpis(): Promise<AdminKpisResponse> {
    const since = new Date(Date.now() - 29 * DAY_MS);
    const sinceIso = isoDate(since);

    const [users, allDays, subscriptions] = await Promise.all([
      this.usersRepository.find(),
      this.activityDaysRepository.find(),
      this.pushSubscriptionsRepository.find(),
    ]);
    const recentDays = allDays.filter((r) => r.date >= sinceIso);
    const subscribedUserIds = new Set(subscriptions.map((s) => s.userId));

    const daysByUser = new Map<string, Set<string>>();
    for (const row of recentDays) {
      const set = daysByUser.get(row.userId) ?? new Set<string>();
      set.add(row.date);
      daysByUser.set(row.userId, set);
    }
    const allTimeDaysByUser = new Map<string, Set<string>>();
    for (const row of allDays) {
      const set = allTimeDaysByUser.get(row.userId) ?? new Set<string>();
      set.add(row.date);
      allTimeDaysByUser.set(row.userId, set);
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
        email: user.email,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        lastSeenAt: user.lastSeenAt,
        loginCount: user.loginCount,
        activeDaysLast7: [...activeDates].filter((d) => d >= last7Cutoff).length,
        activeDaysLast30: [...activeDates].filter((d) => d >= last30Cutoff).length,
        activeDaysAllTime: allTimeDaysByUser.get(user.id)?.size ?? 0,
        last7Days: last7Dates.map((d) => activeDates.has(d)),
        pwaInstalled: user.pwaInstalledAt !== null,
        pwaInstalledAt: user.pwaInstalledAt,
        notificationsEnabled: subscribedUserIds.has(user.id),
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
