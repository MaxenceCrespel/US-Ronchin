import { IsString, MaxLength } from 'class-validator';

/** Sent by the local sync script when a run fails before it could import anything (FFF
 * blocking the connection, the FFF page layout changing, Chrome crashing...) — see
 * StandingsController.reportSyncFailure. */
export class ReportSyncFailureDto {
  @IsString()
  @MaxLength(500)
  errorMessage: string;
}
