import { dealTeams, DealPlayer, Line } from './team-deal';
import {
  PlayerPosition,
  PlayerSubPosition as P,
} from '../users/entities/user.entity';

const player = (userId: string, score: number, ...positions: P[]): DealPlayer => ({
  userId,
  score,
  orderKey: score,
  positions,
});

const teamOf = (r: ReturnType<typeof dealTeams>, id: string) => r.teamByUserId.get(id);
const members = (r: ReturnType<typeof dealTeams>, team: number) =>
  [...r.teamByUserId].filter(([, t]) => t === team).map(([id]) => id).sort();
const totals = (
  r: ReturnType<typeof dealTeams>,
  squad: DealPlayer[],
  teamCount = 2,
) => {
  const sums = new Array<number>(teamCount).fill(0);
  for (const p of squad) sums[r.teamByUserId.get(p.userId)!] += p.score;
  return sums;
};

describe('dealTeams', () => {
  it('splits a line evenly, not just one team after the other', () => {
    const squad = [
      player('f1', 90, P.STRIKER),
      player('f2', 80, P.STRIKER),
      player('f3', 70, P.STRIKER),
      player('f4', 60, P.STRIKER),
    ];
    const r = dealTeams(squad, 2);
    // straight alternation would give f1+f3 (160) against f2+f4 (140)
    expect(totals(r, squad)).toEqual([150, 150]);
    expect(teamOf(r, 'f1')).toBe(teamOf(r, 'f4'));
  });

  it("doesn't give the team with the best forward the best midfielder too", () => {
    const r = dealTeams(
      [
        player('f1', 90, P.STRIKER),
        player('f2', 80, P.STRIKER),
        player('m1', 85, P.CENTER_MIDFIELDER),
        player('m2', 75, P.CENTER_MIDFIELDER),
      ],
      2,
    );
    // the team holding f1 (90 vs 80) starts behind on the total, so the OTHER team opens the next line
    expect(teamOf(r, 'f1')).not.toBe(teamOf(r, 'm1'));
    expect(teamOf(r, 'f1')).toBe(teamOf(r, 'm2'));
  });

  it('lets the team with fewer players open the next line after an odd-sized one', () => {
    const r = dealTeams(
      [
        player('f1', 90, P.STRIKER),
        player('f2', 80, P.STRIKER),
        player('f3', 70, P.STRIKER),
        player('m1', 85, P.CENTER_MIDFIELDER),
        player('m2', 75, P.CENTER_MIDFIELDER),
        player('m3', 65, P.CENTER_MIDFIELDER),
      ],
      2,
    );
    // 3 forwards: 2 / 1 — the team with only one forward takes the best midfielder
    expect(teamOf(r, 'm1')).toBe(teamOf(r, 'f2'));
    expect(members(r, 0)).toHaveLength(3);
    expect(members(r, 1)).toHaveLength(3);
  });

  it('never leaves the teams more than one player apart', () => {
    for (let n = 1; n <= 17; n++) {
      const squad = Array.from({ length: n }, (_, i) =>
        player(`p${i}`, 100 - i, [P.STRIKER, P.CENTER_MIDFIELDER, P.CENTER_BACK, P.GOALKEEPER][i % 4]),
      );
      const r = dealTeams(squad, 2);
      expect(Math.abs(members(r, 0).length - members(r, 1).length)).toBeLessThanOrEqual(1);
    }
  });

  describe('evening out the totals', () => {
    it("doesn't let the three best players stack up on one team", () => {
      // f1 and m1 both open their line on the same team once the goalkeepers are split
      const squad = [
        player('g1', 50, P.GOALKEEPER),
        player('g2', 40, P.GOALKEEPER),
        player('f1', 84, P.STRIKER),
        player('f2', 72, P.STRIKER),
        player('f3', 60, P.STRIKER),
        player('m1', 77, P.CENTER_MIDFIELDER),
        player('m2', 71, P.CENTER_MIDFIELDER),
        player('m3', 52, P.CENTER_MIDFIELDER),
        player('d1', 51, P.CENTER_BACK),
        player('d2', 46, P.CENTER_BACK),
        player('d3', 35, P.CENTER_BACK),
        player('d4', 19, P.CENTER_BACK),
      ];
      const [a, b] = totals(dealTeams(squad, 2), squad);
      expect(Math.abs(a - b)).toBeLessThanOrEqual(5);
    });

    it('keeps every headcount and every line exactly as dealt', () => {
      const random = (() => {
        let seed = 42;
        return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
      })();
      const positions = [
        P.GOALKEEPER,
        P.STRIKER,
        P.CENTER_MIDFIELDER,
        P.CENTER_BACK,
      ];
      const lines: Line[] = [
        PlayerPosition.GOALKEEPER,
        PlayerPosition.FORWARD,
        PlayerPosition.MIDFIELDER,
        PlayerPosition.DEFENDER,
        'NONE',
      ];
      for (let run = 0; run < 200; run++) {
        const n = 4 + Math.floor(random() * 18);
        const squad = Array.from({ length: n }, (_, i) =>
          player(
            `p${i}`,
            Math.round(random() * 1000) / 10,
            positions[Math.floor(random() * positions.length)],
          ),
        );
        const r = dealTeams(squad, 2);
        expect(
          Math.abs(members(r, 0).length - members(r, 1).length),
        ).toBeLessThanOrEqual(1);
        for (const line of lines) {
          const inLine = squad.filter(
            (p) => r.lineByUserId.get(p.userId) === line,
          );
          const onTeam0 = inLine.filter(
            (p) => teamOf(r, p.userId) === 0,
          ).length;
          expect(Math.abs(2 * onTeam0 - inLine.length)).toBeLessThanOrEqual(1);
        }
        const keepers = squad.filter(
          (p) => r.lineByUserId.get(p.userId) === PlayerPosition.GOALKEEPER,
        );
        if (keepers.length === 2) {
          expect(teamOf(r, keepers[0].userId)).not.toBe(
            teamOf(r, keepers[1].userId),
          );
        }
      }
    });
  });

  describe('goalkeepers', () => {
    it('splits two goalkeepers, one per team', () => {
      const r = dealTeams([player('g1', 70, P.GOALKEEPER), player('g2', 60, P.GOALKEEPER)], 2);
      expect(teamOf(r, 'g1')).not.toBe(teamOf(r, 'g2'));
    });

    it("deals a lone goalkeeper in his secondary position", () => {
      const r = dealTeams(
        [player('g', 70, P.GOALKEEPER, P.CENTER_BACK), player('d1', 80, P.CENTER_BACK), player('d2', 60, P.CENTER_BACK)],
        2,
      );
      expect(r.lineByUserId.get('g')).toBe('DEFENDER');
      // ranked with the defenders: d1 (80), g (70), d2 (60) — then evened out to g+d2 against d1
      expect(teamOf(r, 'g')).toBe(teamOf(r, 'd2'));
      expect(teamOf(r, 'g')).not.toBe(teamOf(r, 'd1'));
    });

    it('with a lone goalkeeper and no secondary position, deals him last, by score', () => {
      const r = dealTeams([player('g', 70, P.GOALKEEPER), player('f1', 80, P.STRIKER)], 2);
      expect(r.lineByUserId.get('g')).toBe('NONE');
    });

    it('splits the best two of three goalkeepers and deals the third in his secondary position', () => {
      const r = dealTeams(
        [
          player('g1', 90, P.GOALKEEPER),
          player('g2', 80, P.GOALKEEPER),
          player('g3', 70, P.GOALKEEPER, P.STRIKER),
        ],
        2,
      );
      expect(teamOf(r, 'g1')).not.toBe(teamOf(r, 'g2'));
      expect(r.lineByUserId.get('g1')).toBe('GOALKEEPER');
      expect(r.lineByUserId.get('g3')).toBe('FORWARD');
    });
  });

  it('uses the primary position, not a later one, as the line', () => {
    const r = dealTeams([player('a', 70, P.STRIKER, P.GOALKEEPER)], 2);
    expect(r.lineByUserId.get('a')).toBe('FORWARD');
  });

  it('deals players with no position last', () => {
    const r = dealTeams([player('x', 99), player('f', 50, P.STRIKER)], 2);
    expect(r.lineByUserId.get('x')).toBe('NONE');
    // f opened the first line, so x (dealt after) goes to the other team
    expect(teamOf(r, 'x')).not.toBe(teamOf(r, 'f'));
  });
});
