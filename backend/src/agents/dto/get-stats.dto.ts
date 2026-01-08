import { IsDateString, IsOptional } from 'class-validator';

/**
 * DTO para buscar estatísticas de um agente
 */
export class GetStatsDto {
  @IsOptional()
  @IsDateString({}, { message: 'startDate deve ser uma data válida (ISO 8601)' })
  startDate?: string;

  @IsOptional()
  @IsDateString({}, { message: 'endDate deve ser uma data válida (ISO 8601)' })
  endDate?: string;
}
