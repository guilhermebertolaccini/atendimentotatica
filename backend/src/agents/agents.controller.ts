import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AgentsService } from './agents.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { GetStatsDto } from './dto';

/**
 * Controller responsável por gerenciar agentes e suas operações
 *
 * Rotas protegidas por JWT e sistema de permissões
 */
@Controller('agents')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  /**
   * GET /agents
   * Lista todos os agentes do sistema
   * Permissão: users:read (apenas admin/supervisor)
   */
  @Get()
  @Permissions('users:read')
  async getAllAgents(@Query('includeInactive') includeInactive?: string) {
    const includeInactiveBool = includeInactive === 'true';
    return this.agentsService.getAllAgents(includeInactiveBool);
  }

  /**
   * GET /agents/line/:lineId
   * Retorna todos os agentes de uma linha específica
   * Permissão: users:read (apenas admin/supervisor)
   */
  @Get('line/:lineId')
  @Permissions('users:read')
  async getAgentsByLine(@Param('lineId', ParseIntPipe) lineId: number) {
    return this.agentsService.getAgentsByLine(lineId);
  }

  /**
   * GET /agents/line/:lineId/online
   * Retorna agentes online de uma linha específica
   * Permissão: agents:read-team (agentes podem ver sua equipe)
   */
  @Get('line/:lineId/online')
  @Permissions('agents:read-team')
  async getOnlineAgentsByLine(@Param('lineId', ParseIntPipe) lineId: number) {
    return this.agentsService.getOnlineAgentsByLine(lineId);
  }

  /**
   * GET /agents/me/line
   * Retorna a linha do agente logado
   * Permissão: profile:read (agente pode ver sua própria linha)
   */
  @Get('me/line')
  @Permissions('profile:read')
  async getMyLine(@Request() req) {
    return this.agentsService.getAgentLine(req.user.userId);
  }

  /**
   * GET /agents/me/conversations
   * Retorna conversas ativas da linha do agente logado
   * Permissão: conversations:read (agente pode ver conversas)
   */
  @Get('me/conversations')
  @Permissions('conversations:read')
  async getMyConversations(@Request() req) {
    return this.agentsService.getAgentConversations(req.user.userId);
  }

  /**
   * GET /agents/me/stats
   * Retorna estatísticas do agente logado
   * Permissão: reports:own (agente pode ver suas próprias estatísticas)
   */
  @Get('me/stats')
  @Permissions('reports:own')
  async getMyStats(@Request() req, @Query() query: GetStatsDto) {
    // Definir período padrão: último mês
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    const startDate = query.startDate
      ? new Date(query.startDate)
      : (() => {
          const date = new Date();
          date.setMonth(date.getMonth() - 1);
          return date;
        })();

    return this.agentsService.getAgentStats(
      req.user.userId,
      startDate,
      endDate,
    );
  }

  /**
   * GET /agents/me/details
   * Retorna informações detalhadas do agente logado
   * Permissão: profile:read
   */
  @Get('me/details')
  @Permissions('profile:read')
  async getMyDetails(@Request() req) {
    return this.agentsService.getAgentDetails(req.user.userId);
  }

  /**
   * GET /agents/:agentId
   * Retorna detalhes de um agente específico
   * Permissão: users:read (apenas admin/supervisor)
   */
  @Get(':agentId')
  @Permissions('users:read')
  async getAgentDetails(@Param('agentId', ParseIntPipe) agentId: number) {
    return this.agentsService.getAgentDetails(agentId);
  }

  /**
   * GET /agents/:agentId/stats
   * Retorna estatísticas de um agente específico
   * Permissão: users:read (apenas admin/supervisor)
   */
  @Get(':agentId/stats')
  @Permissions('users:read')
  async getAgentStats(
    @Param('agentId', ParseIntPipe) agentId: number,
    @Query() query: GetStatsDto,
  ) {
    const endDate = query.endDate ? new Date(query.endDate) : new Date();
    const startDate = query.startDate
      ? new Date(query.startDate)
      : (() => {
          const date = new Date();
          date.setMonth(date.getMonth() - 1);
          return date;
        })();

    return this.agentsService.getAgentStats(agentId, startDate, endDate);
  }

  /**
   * POST /agents/:agentId/line/:lineId
   * Vincula um agente a uma linha
   * Permissão: users:manage (apenas admin)
   */
  @Post(':agentId/line/:lineId')
  @Permissions('users:manage')
  @HttpCode(HttpStatus.CREATED)
  async assignToLine(
    @Param('agentId', ParseIntPipe) agentId: number,
    @Param('lineId', ParseIntPipe) lineId: number,
  ) {
    return this.agentsService.assignAgentToLine(agentId, lineId);
  }

  /**
   * DELETE /agents/:agentId/line/:lineId
   * Remove vínculo de agente com linha
   * Permissão: users:manage (apenas admin)
   */
  @Delete(':agentId/line/:lineId')
  @Permissions('users:manage')
  @HttpCode(HttpStatus.OK)
  async removeFromLine(
    @Param('agentId', ParseIntPipe) agentId: number,
    @Param('lineId', ParseIntPipe) lineId: number,
  ) {
    return this.agentsService.removeAgentFromLine(agentId, lineId);
  }

  /**
   * POST /agents/conversations/cleanup
   * Limpa bindings de conversas expirados
   * Permissão: users:manage (apenas admin)
   */
  @Post('conversations/cleanup')
  @Permissions('users:manage')
  @HttpCode(HttpStatus.OK)
  async cleanupExpiredBindings() {
    const count = await this.agentsService.cleanExpiredConversationBindings();
    return {
      success: true,
      message: `${count} bindings expirados removidos`,
      count,
    };
  }
}
