import { TestApp, TestUser } from './test-app';
import { PlayerSubPosition, SeniorityTier, UserRole } from '../users/entities/user.entity';
import { Match, MatchHomeAway, MatchSource, MatchStatus } from '../matches/entities/match.entity';
import { MatchComposition } from '../matches/entities/match-composition.entity';
import { GoalType, MatchEvent, MatchEventType } from '../matches/entities/match-event.entity';
import { MatchMotmVote } from '../matches/entities/match-motm-vote.entity';
import { MatchDefenseBossVote } from '../matches/entities/match-defense-boss-vote.entity';
import { PlayerRating } from '../matches/entities/player-rating.entity';
import { MatchAttendance } from '../matches/entities/match-attendance.entity';
import { Training, TrainingType } from '../trainings/entities/training.entity';
import { TrainingSession } from '../trainings/entities/training-session.entity';
import { Attendance, AttendanceStatus } from '../attendances/entities/attendance.entity';
import { TrainingTeamAssignment } from '../team-balancing/entities/training-team-assignment.entity';
import { PlayerPosition } from '../users/entities/user.entity';


/** A realistic mini-season written straight into the DB: several finished matches with
 * goals/cards/votes/ratings, and a run of trainings with declared + real attendance. The
 * assertions are deliberately about behaviour that matters (who tops what), on top of
 * exercising every stats / badge / ranking read path. */

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

export interface SeasonData {
  coach: TestUser;
  admin: TestUser;
  players: TestUser[];
  matchIds: string[];
  sessionIds: string[];
}

/** A realistic mini-season written straight into the DB: five finished matches with
 * goals/cards/votes/ratings and ten trainings with declared + real attendance. Shared by the
 * season integration spec and the fixture dumper used by the web tests. */
export async function seedSeason(t: TestApp): Promise<SeasonData> {
  const matchIds: string[] = [];
  const sessionIds: string[] = [];
  const coach = await t.createUser({ role: UserRole.COACH });
  const admin = await t.createUser({ role: UserRole.SUPERADMIN });
  const positions = [
      PlayerSubPosition.GOALKEEPER,
      PlayerSubPosition.CENTER_BACK,
      PlayerSubPosition.CENTER_BACK,
      PlayerSubPosition.RIGHT_BACK,
      PlayerSubPosition.LEFT_BACK,
      PlayerSubPosition.CENTER_MIDFIELDER,
      PlayerSubPosition.DEFENSIVE_MIDFIELDER,
      PlayerSubPosition.ATTACKING_MIDFIELDER,
      PlayerSubPosition.STRIKER,
      PlayerSubPosition.STRIKER,
      PlayerSubPosition.RIGHT_WINGER,
      PlayerSubPosition.CENTER_MIDFIELDER,
    ];
  const p: TestUser[] = [];
    for (const [i, pos] of positions.entries()) {
      p.push(
        await t.createUser({
          positions: [pos],
          isLicensed: i % 3 === 0,
          seniorityTier: [SeniorityTier.ONE_TO_THREE, SeniorityTier.THREE_TO_SEVEN, SeniorityTier.SEVEN_PLUS][i % 3],
          birthDate: i === 3 ? day(-1).replace(/^\d{4}/, '1990') : '1995-05-05',
          jerseyNumber: i + 1,
        }),
      );
    }

    // ---- matches -------------------------------------------------------------
    const matches = t.repo(Match);
    const comps = t.repo(MatchComposition);
    const events = t.repo(MatchEvent);
    const motm = t.repo(MatchMotmVote);
    const boss = t.repo(MatchDefenseBossVote);
    const ratings = t.repo(PlayerRating);
    const attendances = t.repo(MatchAttendance);

    const specs = [
      { off: -30, ha: MatchHomeAway.HOME, src: MatchSource.OFFICIAL_FFF, us: 5, them: 0, comp: 'D6 Poule A' }, // clean sheet, big win
      { off: -23, ha: MatchHomeAway.AWAY, src: MatchSource.OFFICIAL_FFF, us: 3, them: 2, comp: 'Coupe de France' },
      { off: -16, ha: MatchHomeAway.HOME, src: MatchSource.FRIENDLY, us: 1, them: 1, comp: null },
      { off: -9, ha: MatchHomeAway.AWAY, src: MatchSource.OFFICIAL_FFF, us: 2, them: 3, comp: 'D6 Poule A' }, // loss
      { off: -2, ha: MatchHomeAway.HOME, src: MatchSource.OFFICIAL_FFF, us: 4, them: 0, comp: 'D6 Poule A' },
    ];
    for (const [mi, s] of specs.entries()) {
      const m = await matches.save(
        matches.create({
          date: day(s.off),
          kickOffTime: '15:00',
          opponent: `Opponent ${mi}`,
          homeAway: s.ha,
          source: s.src,
          competition: s.comp,
          status: MatchStatus.PLAYED,
          scoreHome: s.ha === MatchHomeAway.HOME ? s.us : s.them,
          scoreAway: s.ha === MatchHomeAway.HOME ? s.them : s.us,
          resultConfirmedAt: new Date(Date.now() - (Math.abs(s.off) - 1) * 86_400_000),
          createdBy: coach.user.id,
        }),
      );
      matchIds.push(m.id);
      // 11 starters + 1 sub (p[11]) + one guest
      for (const [i, pl] of p.entries()) {
        await comps.save(
          comps.create({
            matchId: m.id,
            userId: pl.user.id,
            isStarter: i < 11,
            isSpectator: false,
            position:
              i === 0 ? PlayerPosition.GOALKEEPER : i < 5 ? PlayerPosition.DEFENDER : i < 8 ? PlayerPosition.MIDFIELDER : PlayerPosition.FORWARD,
            formationX: 10 + i * 7,
            formationY: i === 0 ? 92 : i < 5 ? 70 : i < 8 ? 45 : 18,
          }),
        );
        await attendances.save(attendances.create({ matchId: m.id, userId: pl.user.id, status: AttendanceStatus.PRESENT }));
      }
      await comps.save(comps.create({ matchId: m.id, guestFirstName: 'Guest', guestLastName: `M${mi}`, isStarter: false, isSpectator: false }));

      // goals: hat trick by p[8] in match 0, a brace by p[9] in match 1, single goals elsewhere
      const goalPlan: [number, number, number | null, GoalType | null][] = [];
      for (let g = 0; g < s.us; g++) {
        const scorer = mi === 0 && g < 3 ? 8 : mi === 1 && g < 2 ? 9 : 8 + (g % 4);
        goalPlan.push([scorer, 10 + g * 12, g % 2 === 0 ? 7 : null, g === 3 ? GoalType.PENALTY : null]);
      }
      for (const [scorer, minute, assist, goalType] of goalPlan) {
        await events.save(
          events.create({
            matchId: m.id,
            type: MatchEventType.GOAL,
            userId: p[scorer].user.id,
            assistUserId: assist !== null && assist !== scorer ? p[assist].user.id : null,
            minute,
            goalType,
          }),
        );
      }
      if (mi === 3) {
        await events.save(events.create({ matchId: m.id, type: MatchEventType.RED_CARD, userId: p[2].user.id, minute: 60 }));
        await events.save(events.create({ matchId: m.id, type: MatchEventType.GOAL, userId: p[5].user.id, minute: 75, goalType: GoalType.OWN_GOAL }));
      }
      await events.save(events.create({ matchId: m.id, type: MatchEventType.YELLOW_CARD, userId: p[3].user.id, minute: 30 }));

      // votes: everybody starts voting for p[8] (or p[9] on odd matches), defense boss = p[1]
      const allComps = await comps.find({ where: { matchId: m.id } });
      const compOf = (u: TestUser) => allComps.find((c) => c.userId === u.user.id)!;
      for (const [i, voter] of p.entries()) {
        const target = mi % 2 === 0 ? p[8] : p[9];
        if (voter.user.id === target.user.id) continue;
        await motm.save(motm.create({ matchId: m.id, voterId: voter.user.id, votedForId: target.user.id, createdAt: new Date(Date.now() - 40 * 3_600_000) }));
        if (i > 0 && i < 5 && voter.user.id !== p[1].user.id) {
          await boss.save(boss.create({ matchId: m.id, voterId: voter.user.id, votedForId: p[1].user.id }));
        }
        for (const other of p) {
          if (other.user.id === voter.user.id) continue;
          await ratings.save(ratings.create({ matchId: m.id, raterId: voter.user.id, ratedUserId: other.user.id, rating: 5 + ((i + mi) % 5) + (other === p[8] ? 1.5 : 0) }));
        }
      }
      void compOf;
    }

    // ---- trainings -----------------------------------------------------------
    const trainings = t.repo(Training);
    const sessions = t.repo(TrainingSession);
    const att = t.repo(Attendance);
    const assigns = t.repo(TrainingTeamAssignment);
    const training = await trainings.save(
      trainings.create({
        title: 'Mardi',
        type: TrainingType.RECURRING,
        location: 'Stade',
        dayOfWeek: 2,
        startTime: '19:00',
        endTime: '20:30',
        startDate: day(-70),
        createdBy: coach.user.id,
      }),
    );
    for (let s = 0; s < 10; s++) {
      const session = await sessions.save(
        sessions.create({
          trainingId: training.id,
          date: day(-7 * (10 - s)),
          startTime: '19:00',
          endTime: '20:30',
          location: 'Stade',
          scoreTeam0: s % 3 === 0 ? 4 : 2,
          scoreTeam1: s % 3 === 0 ? 1 : 2,
        }),
      );
      sessionIds.push(session.id);
      for (const [i, pl] of p.entries()) {
        // p[0] never misses (streak), p[1] declares present but is absent for real ("beau parleur"),
        // p[2] never answers, the others alternate
        if (i === 2) continue;
        const declared = i === 1 ? AttendanceStatus.PRESENT : (s + i) % 4 === 0 ? AttendanceStatus.ABSENT : AttendanceStatus.PRESENT;
        const actual = i === 1 ? AttendanceStatus.ABSENT : i === 0 ? AttendanceStatus.PRESENT : declared;
        await att.save(att.create({ trainingSessionId: session.id, userId: pl.user.id, status: declared, actualStatus: actual, respondedAt: new Date() }));
        if (actual === AttendanceStatus.PRESENT) {
          await assigns.save(assigns.create({ trainingSessionId: session.id, userId: pl.user.id, teamIndex: i % 2 }));
        }
      }
    }
  return { coach, admin, players: p, matchIds, sessionIds };
}
