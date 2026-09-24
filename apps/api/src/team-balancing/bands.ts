import { PlayerPosition, PlayerSubPosition } from '../users/entities/user.entity';

export const BAND_BY_SUBPOSITION: Record<PlayerSubPosition, PlayerPosition> = {
  [PlayerSubPosition.GOALKEEPER]: PlayerPosition.GOALKEEPER,
  [PlayerSubPosition.CENTER_BACK]: PlayerPosition.DEFENDER,
  [PlayerSubPosition.RIGHT_BACK]: PlayerPosition.DEFENDER,
  [PlayerSubPosition.LEFT_BACK]: PlayerPosition.DEFENDER,
  [PlayerSubPosition.DEFENSIVE_MIDFIELDER]: PlayerPosition.MIDFIELDER,
  [PlayerSubPosition.CENTER_MIDFIELDER]: PlayerPosition.MIDFIELDER,
  [PlayerSubPosition.RIGHT_MIDFIELDER]: PlayerPosition.MIDFIELDER,
  [PlayerSubPosition.LEFT_MIDFIELDER]: PlayerPosition.MIDFIELDER,
  [PlayerSubPosition.ATTACKING_MIDFIELDER]: PlayerPosition.MIDFIELDER,
  [PlayerSubPosition.RIGHT_WINGER]: PlayerPosition.FORWARD,
  [PlayerSubPosition.LEFT_WINGER]: PlayerPosition.FORWARD,
  [PlayerSubPosition.STRIKER]: PlayerPosition.FORWARD,
};

export const BANDS: PlayerPosition[] = [
  PlayerPosition.GOALKEEPER,
  PlayerPosition.DEFENDER,
  PlayerPosition.MIDFIELDER,
  PlayerPosition.FORWARD,
];

/** A player "covers" a band as soon as ANY of their selected positions maps to it —
 * a defender who also plays midfield can count as midfield cover if a team needs one. */
export function bandsCovered(user: { positions?: PlayerSubPosition[] | null }): Set<PlayerPosition> {
  return new Set((user.positions ?? []).map((p) => BAND_BY_SUBPOSITION[p]));
}
