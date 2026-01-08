import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Role } from '@prisma/client';

/**
 * Serviço responsável por gerenciar agentes e suas operações
 *
 * Agentes são operadores com permissões restritas que compartilham linhas
 * em tempo real, permitindo que múltiplos agentes atendam na mesma linha.
 */
@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Retorna todos os agentes vinculados a uma linha
   *
   * @param lineId - ID da linha
   * @returns Array de agentes com informações básicas
   */
  async getAgentsByLine(lineId: number) {
    this.logger.log(`Buscando agentes da linha ${lineId}`);

    const agents = await this.prisma.user.findMany({
      where: {
        role: Role.agente,
        lineOperators: {
          some: { lineId },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        createdAt: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    this.logger.log(`Encontrados ${agents.length} agentes na linha ${lineId}`);
    return agents;
  }

  /**
   * Retorna a linha de um agente
   *
   * @param agentId - ID do agente
   * @returns Linha do agente ou null se não tiver linha
   */
  async getAgentLine(agentId: number) {
    this.logger.debug(`Buscando linha do agente ${agentId}`);

    const lineOperator = await this.prisma.lineOperator.findFirst({
      where: { userId: agentId },
      include: {
        line: {
          select: {
            id: true,
            phone: true,
            lineStatus: true,
            segment: true,
            evolutionName: true,
            oficial: true,
          },
        },
      },
    });

    if (!lineOperator) {
      this.logger.debug(`Agente ${agentId} não possui linha vinculada`);
      return null;
    }

    this.logger.debug(
      `Agente ${agentId} está vinculado à linha ${lineOperator.line.id}`,
    );
    return lineOperator.line;
  }

  /**
   * Vincula um agente a uma linha
   *
   * @param agentId - ID do agente
   * @param lineId - ID da linha
   * @throws BadRequestException se o usuário não for agente ou já estiver vinculado
   * @throws NotFoundException se o agente ou linha não existir
   */
  async assignAgentToLine(agentId: number, lineId: number) {
    this.logger.log(`Vinculando agente ${agentId} à linha ${lineId}`);

    // Validar se o usuário existe e é agente
    const user = await this.prisma.user.findUnique({
      where: { id: agentId },
    });

    if (!user) {
      throw new NotFoundException(`Usuário com ID ${agentId} não encontrado`);
    }

    if (user.role !== Role.agente) {
      throw new BadRequestException(
        `Usuário ${user.name} não é um agente (role atual: ${user.role})`,
      );
    }

    // Validar se a linha existe
    const line = await this.prisma.linesStock.findUnique({
      where: { id: lineId },
    });

    if (!line) {
      throw new NotFoundException(`Linha com ID ${lineId} não encontrada`);
    }

    if (line.lineStatus !== 'active') {
      throw new BadRequestException(
        `Linha ${line.phone} não está ativa (status: ${line.lineStatus})`,
      );
    }

    // Verificar se já está vinculado
    const existingBinding = await this.prisma.lineOperator.findUnique({
      where: {
        lineId_userId: { lineId, userId: agentId },
      },
    });

    if (existingBinding) {
      throw new BadRequestException(
        `Agente ${user.name} já está vinculado à linha ${line.phone}`,
      );
    }

    // Criar vínculo
    const binding = await this.prisma.lineOperator.create({
      data: {
        lineId,
        userId: agentId,
      },
      include: {
        line: {
          select: {
            id: true,
            phone: true,
            evolutionName: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    this.logger.log(
      `Agente ${user.name} vinculado com sucesso à linha ${line.phone}`,
    );

    return binding;
  }

  /**
   * Remove um agente de uma linha
   *
   * @param agentId - ID do agente
   * @param lineId - ID da linha
   * @throws NotFoundException se o vínculo não existir
   */
  async removeAgentFromLine(agentId: number, lineId: number) {
    this.logger.log(`Removendo agente ${agentId} da linha ${lineId}`);

    const binding = await this.prisma.lineOperator.findUnique({
      where: {
        lineId_userId: { lineId, userId: agentId },
      },
    });

    if (!binding) {
      throw new NotFoundException(
        `Agente ${agentId} não está vinculado à linha ${lineId}`,
      );
    }

    await this.prisma.lineOperator.delete({
      where: {
        lineId_userId: { lineId, userId: agentId },
      },
    });

    this.logger.log(
      `Agente ${agentId} removido com sucesso da linha ${lineId}`,
    );

    return { success: true, message: 'Agente removido da linha com sucesso' };
  }

  /**
   * Retorna todas as conversas ativas da linha do agente
   *
   * @param agentId - ID do agente
   * @returns Array de conversas ativas
   */
  async getAgentConversations(agentId: number) {
    this.logger.debug(`Buscando conversas do agente ${agentId}`);

    const line = await this.getAgentLine(agentId);

    if (!line) {
      this.logger.warn(`Agente ${agentId} não possui linha vinculada`);
      return [];
    }

    // Buscar conversas vinculadas à linha (não expiradas)
    const bindings = await this.prisma.conversationLineBinding.findMany({
      where: {
        lineId: line.id,
        expiresAt: { gt: new Date() },
      },
    });

    if (bindings.length === 0) {
      this.logger.debug(`Nenhuma conversa ativa para a linha ${line.id}`);
      return [];
    }

    const contactPhones = bindings.map((b) => b.contactPhone);

    // Buscar últimas mensagens de cada conversa
    const conversations = await this.prisma.conversation.findMany({
      where: {
        contactPhone: { in: contactPhones },
        tabulation: null, // Apenas conversas ativas (não tabuladas)
      },
      orderBy: { datetime: 'desc' },
      take: 100, // Limitar a 100 conversas mais recentes
    });

    // Agrupar por contactPhone para pegar apenas a última mensagem de cada
    const conversationsMap = new Map();
    for (const conv of conversations) {
      if (!conversationsMap.has(conv.contactPhone)) {
        conversationsMap.set(conv.contactPhone, conv);
      }
    }

    const result = Array.from(conversationsMap.values());

    this.logger.debug(
      `Encontradas ${result.length} conversas ativas para o agente ${agentId}`,
    );

    return result;
  }

  /**
   * Registra uma mensagem enviada por um agente
   *
   * @param conversationId - ID da conversa (mensagem)
   * @param agentId - ID do agente que enviou
   * @param lineId - ID da linha
   * @returns Registro de tracking criado
   */
  async trackAgentMessage(
    conversationId: number,
    agentId: number,
    lineId: number,
  ) {
    this.logger.debug(
      `Registrando mensagem ${conversationId} do agente ${agentId} na linha ${lineId}`,
    );

    const tracking = await this.prisma.agentMessageTracking.create({
      data: {
        conversationId,
        agentId,
        lineId,
      },
    });

    return tracking;
  }

  /**
   * Retorna estatísticas de um agente em um período
   *
   * @param agentId - ID do agente
   * @param startDate - Data inicial
   * @param endDate - Data final
   * @returns Estatísticas do agente
   */
  async getAgentStats(agentId: number, startDate: Date, endDate: Date) {
    this.logger.debug(
      `Buscando estatísticas do agente ${agentId} de ${startDate.toISOString()} até ${endDate.toISOString()}`,
    );

    // Total de mensagens enviadas
    const messagesSent = await this.prisma.agentMessageTracking.count({
      where: {
        agentId,
        sentAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    // Conversas únicas atendidas
    const conversationsHandled =
      await this.prisma.agentMessageTracking.findMany({
        where: {
          agentId,
          sentAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        distinct: ['conversationId'],
        select: {
          conversationId: true,
        },
      });

    // Mensagens por dia (para gráficos)
    const messagesByDay = await this.prisma.$queryRaw<
      Array<{ date: string; count: bigint }>
    >`
      SELECT
        DATE(sent_at) as date,
        COUNT(*) as count
      FROM "AgentMessageTracking"
      WHERE agent_id = ${agentId}
        AND sent_at >= ${startDate}
        AND sent_at <= ${endDate}
      GROUP BY DATE(sent_at)
      ORDER BY DATE(sent_at) ASC
    `;

    const stats = {
      agentId,
      period: {
        start: startDate,
        end: endDate,
      },
      messagesSent,
      conversationsHandled: conversationsHandled.length,
      averageMessagesPerConversation:
        conversationsHandled.length > 0
          ? Math.round(messagesSent / conversationsHandled.length)
          : 0,
      messagesByDay: messagesByDay.map((day) => ({
        date: day.date,
        count: Number(day.count),
      })),
    };

    this.logger.debug(`Estatísticas do agente ${agentId}:`, stats);

    return stats;
  }

  /**
   * Retorna todos os agentes do sistema
   *
   * @param includeInactive - Se true, inclui agentes offline
   * @returns Array de agentes
   */
  async getAllAgents(includeInactive: boolean = false) {
    this.logger.log(`Buscando todos os agentes (includeInactive: ${includeInactive})`);

    const agents = await this.prisma.user.findMany({
      where: {
        role: Role.agente,
        ...(includeInactive ? {} : { status: 'Online' }),
      },
      include: {
        lineOperators: {
          include: {
            line: {
              select: {
                id: true,
                phone: true,
                segment: true,
              },
            },
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    this.logger.log(`Encontrados ${agents.length} agentes`);
    return agents;
  }

  /**
   * Busca informações detalhadas de um agente
   *
   * @param agentId - ID do agente
   * @returns Informações do agente
   * @throws NotFoundException se o agente não existir
   */
  async getAgentDetails(agentId: number) {
    this.logger.debug(`Buscando detalhes do agente ${agentId}`);

    const agent = await this.prisma.user.findUnique({
      where: { id: agentId },
      include: {
        lineOperators: {
          include: {
            line: {
              select: {
                id: true,
                phone: true,
                lineStatus: true,
                segment: true,
                evolutionName: true,
              },
            },
          },
        },
      },
    });

    if (!agent) {
      throw new NotFoundException(`Agente com ID ${agentId} não encontrado`);
    }

    if (agent.role !== Role.agente) {
      throw new BadRequestException(
        `Usuário ${agent.name} não é um agente (role: ${agent.role})`,
      );
    }

    // Buscar estatísticas do último mês
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 1);

    const stats = await this.getAgentStats(agentId, startDate, endDate);

    return {
      ...agent,
      stats,
    };
  }

  /**
   * Vincula uma conversa à linha (para agentes)
   *
   * @param contactPhone - Telefone do contato
   * @param lineId - ID da linha
   * @param expiresInHours - Horas até expirar (padrão: 24h)
   * @returns Binding criado
   */
  async bindConversationToLine(
    contactPhone: string,
    lineId: number,
    expiresInHours: number = 24,
  ) {
    this.logger.debug(
      `Vinculando conversa ${contactPhone} à linha ${lineId} por ${expiresInHours}h`,
    );

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiresInHours);

    const binding = await this.prisma.conversationLineBinding.upsert({
      where: {
        contactPhone_lineId: {
          contactPhone,
          lineId,
        },
      },
      create: {
        contactPhone,
        lineId,
        expiresAt,
      },
      update: {
        expiresAt, // Renovar expiração
      },
    });

    this.logger.debug(
      `Conversa ${contactPhone} vinculada à linha ${lineId} até ${expiresAt.toISOString()}`,
    );

    return binding;
  }

  /**
   * Limpa bindings de conversas expirados
   *
   * @returns Quantidade de bindings removidos
   */
  async cleanExpiredConversationBindings() {
    this.logger.log('Limpando bindings de conversas expirados');

    const result = await this.prisma.conversationLineBinding.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });

    this.logger.log(`${result.count} bindings expirados removidos`);
    return result.count;
  }

  /**
   * Retorna agentes online de uma linha específica
   *
   * @param lineId - ID da linha
   * @returns Array de agentes online
   */
  async getOnlineAgentsByLine(lineId: number) {
    this.logger.debug(`Buscando agentes online da linha ${lineId}`);

    const agents = await this.prisma.user.findMany({
      where: {
        role: Role.agente,
        status: 'Online',
        lineOperators: {
          some: { lineId },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
      },
    });

    this.logger.debug(
      `Encontrados ${agents.length} agentes online na linha ${lineId}`,
    );

    return agents;
  }
}
