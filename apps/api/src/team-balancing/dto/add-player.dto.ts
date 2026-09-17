import { IsUUID } from 'class-validator';

/** Force-adds a specific roster player, marking them PRESENT along the way (see
 * TeamBalancingService.addPlayerToTeam). */
export class AddPlayerDto {
  @IsUUID()
  userId: string;
}
