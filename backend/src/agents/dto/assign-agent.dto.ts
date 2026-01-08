import { IsInt, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO para vincular um agente a uma linha
 */
export class AssignAgentDto {
  @IsInt({ message: 'agentId deve ser um número inteiro' })
  @IsPositive({ message: 'agentId deve ser positivo' })
  @Type(() => Number)
  agentId: number;

  @IsInt({ message: 'lineId deve ser um número inteiro' })
  @IsPositive({ message: 'lineId deve ser positivo' })
  @Type(() => Number)
  lineId: number;
}
