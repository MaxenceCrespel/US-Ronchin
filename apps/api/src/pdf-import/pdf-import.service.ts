import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { PDFParse } from 'pdf-parse';
import { MatchPdfImport } from './entities/match-pdf-import.entity';
import { User } from '../users/entities/user.entity';
import { MatchHomeAway } from '../matches/entities/match.entity';
import { parseMatchSheet } from './pdf-sheet-parser';
import { detectOurSide, matchUser, teamNameMatches } from './player-matching';
import type { ParsedMatchSheetResponse } from './dto/parsed-match-sheet-response.dto';
import { GoalType } from '../matches/entities/match-event.entity';

const GOAL_TYPE_BY_FFF_LABEL: Record<string, GoalType> = {
  'Du pied': GoalType.FOOT,
  'De la tête': GoalType.HEAD,
  Pénalty: GoalType.PENALTY,
  'Contre son camp': GoalType.OWN_GOAL,
};

@Injectable()
export class PdfImportService {
  constructor(
    @InjectRepository(MatchPdfImport)
    private readonly importsRepository: Repository<MatchPdfImport>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly configService: ConfigService,
  ) {}

  async parseUpload(
    buffer: Buffer,
    fileName: string,
    uploadedBy: string,
  ): Promise<ParsedMatchSheetResponse> {
    const parser = new PDFParse({ data: buffer });
    const { text } = await parser.getText();
    await parser.destroy();

    await this.importsRepository.save(
      this.importsRepository.create({ fileName, rawText: text, uploadedBy, matchId: null }),
    );

    const sheet = parseMatchSheet(text);
    const users = await this.usersRepository.find();
    const clubName = this.configService.get<string>('CLUB_NAME', 'Ronchin');

    const ourSide = detectOurSide(
      sheet.header.homeTeamName,
      sheet.header.awayTeamName,
      sheet.homeComposition,
      sheet.awayComposition,
      users,
      clubName,
    );

    const isHome = ourSide === MatchHomeAway.HOME;
    const ourComposition = isHome ? sheet.homeComposition : sheet.awayComposition;
    const ourTeamRawName = isHome ? sheet.header.homeTeamName : sheet.header.awayTeamName;
    const opponent = isHome ? sheet.header.awayTeamName : sheet.header.homeTeamName;

    const composition = ourComposition.map((player) => ({
      pdfName: player.name,
      licenseNumber: player.licenseNumber,
      jerseyNumber: player.jerseyNumber,
      isStarter: player.isStarter,
      matchedUserId: matchUser(player.name, player.licenseNumber, users)?.id ?? null,
    }));

    const goals = sheet.goals
      .filter((g) => teamNameMatches(g.teamName, ourTeamRawName))
      .map((g) => ({
        minute: g.minute,
        playerPdfName: g.playerName,
        matchedUserId: matchUser(g.playerName, g.licenseNumber, users)?.id ?? null,
        assistPdfName: g.passeurName,
        assistMatchedUserId: g.passeurName ? (matchUser(g.passeurName, null, users)?.id ?? null) : null,
        goalType: GOAL_TYPE_BY_FFF_LABEL[g.goalType] ?? null,
      }));

    const cards = sheet.cards
      .filter((c) => teamNameMatches(c.teamName, ourTeamRawName))
      .map((c) => ({
        minute: c.minute,
        playerPdfName: c.playerName,
        matchedUserId: matchUser(c.playerName, c.licenseNumber, users)?.id ?? null,
        type: c.cardType,
        needsReview: c.needsReview,
      }));

    return {
      matchInfo: {
        fffMatchId: sheet.header.fffMatchId,
        date: toIsoDate(sheet.header.date),
        kickOffTime: sheet.header.kickOffTime,
        competition: sheet.header.competition,
        venue: sheet.header.venue,
        opponent,
        homeAway: ourSide,
        scoreHome: sheet.header.scoreHome,
        scoreAway: sheet.header.scoreAway,
      },
      composition,
      goals,
      cards,
    };
  }
}

function toIsoDate(frenchDate: string | null): string | null {
  if (!frenchDate) return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(frenchDate);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}
