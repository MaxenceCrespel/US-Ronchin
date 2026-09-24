import { dealTeams, DealPlayer } from './team-deal';
import { PlayerSubPosition as P } from '../users/entities/user.entity';

const player = (userId: string, score: number, ...positions: P[]): DealPlayer => ({
  userId,
  score,
  orderKey: score,
  positions,
});

const teamOf = (r: ReturnType<typeof dealTeams>, id: string) => r.teamByUserId.get(id);
const members = (r: ReturnType<typeof dealTeams>, team: number) =>
  [...r.teamByUserId].filter(([, t]) => t === team).map(([id]) => id).sort();

describe('dealTeams', () => {
  it('deals a line best player first, one team after the other', () => {
    const r = dealTeams(
      [player('f1', 90, P.STRIKER), player('f2', 80, P.STRIKER), player('f3', 70, P.STRIKER), player('f4', 60, P.STRIKER)],
      2,
    );
    expect(members(r, 0)).toEqual(['f1', 'f3']);
    expect(members(r, 1)).toEqual(['f2', 'f4']);
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
      // ranked with the defenders: d1 (80), g (70), d2 (60)
      expect(teamOf(r, 'd1')).toBe(teamOf(r, 'd2'));
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
