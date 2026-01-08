import { Socket, Server } from 'socket.io';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AgentsService } from '../agents/agents.service';
import { ConversationsService } from '../conversations/conversations.service';
import { Role } from '@prisma/client';

/**
 * Helper para funcionalidades de agentes no WebSocket
 *
 * Fornece métodos auxiliares para gerenciar agentes em tempo real
 */
export class AgentsWebSocketHelper {
  private readonly logger = new Logger(AgentsWebSocketHelper.name);

  constructor(
    private prisma: PrismaService,
    private agentsService: AgentsService,
    private conversationsService: ConversationsService,
  ) {}

  /**
   * Verifica se um usuário é agente
   */
  isAgent(userRole: Role): boolean {
    return userRole === Role.agente;
  }

  /**
   * Carrega conversas da linha para agentes
   * Agentes veem todas as conversas da linha, não apenas as suas
   */
  async loadAgentConversations(
    client: Socket,
    userId: number,
    server: Server,
  ) {
    try {
      // Buscar linha do agente
      const line = await this.agentsService.getAgentLine(userId);

      if (!line) {
        this.logger.warn(`Agente ${userId} não possui linha vinculada`);
        client.emit('error', {
          message:
            'Você não está vinculado a nenhuma linha. Contate um administrador.',
        });
        return null;
      }

      // Buscar conversas ativas da linha
      const conversations =
        await this.conversationsService.findActiveConversationsByLine(line.id);

      // Adicionar agente ao room da linha
      client.join(`line-${line.id}`);

      this.logger.log(
        `Agente ${userId} adicionado ao room line-${line.id} com ${conversations.length} conversas`,
      );

      // Emitir conversas para o agente
      client.emit('conversations-loaded', {
        conversations,
        lineId: line.id,
        mode: 'shared', // Indica que é modo compartilhado (múltiplos agentes)
        lineInfo: {
          id: line.id,
          phone: line.phone,
          segment: line.segment,
        },
      });

      // Buscar e emitir agentes online da linha
      const onlineAgents = await this.agentsService.getOnlineAgentsByLine(
        line.id,
      );

      // Notificar o agente sobre outros agentes online
      client.emit('agents-online-updated', {
        agents: onlineAgents,
        total: onlineAgents.length,
      });

      // Notificar outros agentes que um novo agente entrou online
      server.to(`line-${line.id}`).except(client.id).emit('agent-joined', {
        agentId: userId,
        timestamp: new Date(),
      });

      return line;
    } catch (error) {
      this.logger.error(
        `Erro ao carregar conversas do agente ${userId}`,
        error,
      );
      client.emit('error', {
        message: 'Erro ao carregar conversas. Tente reconectar.',
      });
      return null;
    }
  }

  /**
   * Emite mensagem para todos os agentes de uma linha
   */
  emitToLineAgents(
    server: Server,
    lineId: number,
    event: string,
    data: any,
    exceptSocketId?: string,
  ) {
    const room = `line-${lineId}`;

    if (exceptSocketId) {
      server.to(room).except(exceptSocketId).emit(event, data);
    } else {
      server.to(room).emit(event, data);
    }

    this.logger.debug(
      `Evento '${event}' emitido para room ${room}${exceptSocketId ? ` (exceto ${exceptSocketId})` : ''}`,
    );
  }

  /**
   * Processa mensagem enviada por agente
   * Registra tracking e emite para outros agentes
   */
  async processAgentMessage(
    client: Socket,
    server: Server,
    userId: number,
    userName: string,
    conversationId: number,
    contactPhone: string,
  ) {
    try {
      // Buscar linha do agente
      const line = await this.agentsService.getAgentLine(userId);

      if (!line) {
        this.logger.warn(
          `Agente ${userId} tentou enviar mensagem sem linha vinculada`,
        );
        return;
      }

      // Registrar tracking da mensagem
      await this.agentsService.trackAgentMessage(
        conversationId,
        userId,
        line.id,
      );

      // Vincular/renovar binding da conversa à linha
      await this.conversationsService.bindConversationToLine(
        contactPhone,
        line.id,
        24, // 24 horas
      );

      // Buscar conversação completa para emitir
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
      });

      if (!conversation) {
        return;
      }

      // Emitir confirmação para o agente que enviou
      client.emit('message-sent', {
        conversation,
        sentBy: userName,
        sentByAgentId: userId,
        timestamp: new Date(),
      });

      // Emitir para outros agentes da linha
      this.emitToLineAgents(
        server,
        line.id,
        'new_message',
        {
          conversation,
          sentBy: userName,
          sentByAgentId: userId,
          isIncoming: false,
          timestamp: new Date(),
        },
        client.id, // Exceto o agente que enviou
      );

      this.logger.debug(
        `Mensagem do agente ${userName} (ID: ${userId}) processada e emitida para linha ${line.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Erro ao processar mensagem do agente ${userId}`,
        error,
      );
    }
  }

  /**
   * Processa mensagem recebida de cliente para agentes
   * Vincula à linha e emite para todos os agentes
   */
  async processIncomingMessageForAgents(
    server: Server,
    contactPhone: string,
    messageData: any,
  ) {
    try {
      // Buscar binding existente
      let binding =
        await this.conversationsService.getConversationLineBinding(
          contactPhone,
        );

      // Se não houver binding, criar um com a primeira linha disponível
      if (!binding) {
        // Buscar linha ativa com agentes
        const lineWithAgents = await this.prisma.linesStock.findFirst({
          where: {
            lineStatus: 'active',
            operators: {
              some: {
                user: {
                  role: Role.agente,
                  status: 'Online',
                },
              },
            },
          },
          include: {
            operators: {
              where: {
                user: {
                  role: Role.agente,
                  status: 'Online',
                },
              },
            },
          },
        });

        if (lineWithAgents) {
          // Criar binding
          await this.conversationsService.bindConversationToLine(
            contactPhone,
            lineWithAgents.id,
            24,
          );

          binding = {
            contactPhone,
            lineId: lineWithAgents.id,
            line: lineWithAgents,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            id: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          this.logger.log(
            `Nova conversa ${contactPhone} vinculada à linha ${lineWithAgents.id}`,
          );
        } else {
          this.logger.warn(
            `Nenhuma linha com agentes online disponível para ${contactPhone}`,
          );
          return;
        }
      }

      // Emitir mensagem para todos os agentes da linha
      this.emitToLineAgents(server, binding.lineId, 'new_message', {
        conversation: messageData,
        sentBy: 'Cliente',
        isIncoming: true,
        contactPhone,
        timestamp: new Date(),
      });

      this.logger.debug(
        `Mensagem recebida de ${contactPhone} emitida para agentes da linha ${binding.lineId}`,
      );
    } catch (error) {
      this.logger.error(
        `Erro ao processar mensagem recebida para agentes (${contactPhone})`,
        error,
      );
    }
  }

  /**
   * Processa evento de typing (agente está digitando)
   */
  async processAgentTyping(
    client: Socket,
    server: Server,
    userId: number,
    userName: string,
    contactPhone: string,
    isTyping: boolean,
  ) {
    try {
      const line = await this.agentsService.getAgentLine(userId);

      if (!line) {
        return;
      }

      // Emitir para outros agentes da linha
      this.emitToLineAgents(
        server,
        line.id,
        isTyping ? 'agent-typing' : 'agent-stopped-typing',
        {
          contactPhone,
          agentName: userName,
          agentId: userId,
          timestamp: new Date(),
        },
        client.id,
      );

      this.logger.debug(
        `Agente ${userName} ${isTyping ? 'começou' : 'parou'} de digitar para ${contactPhone}`,
      );
    } catch (error) {
      this.logger.error(`Erro ao processar typing do agente ${userId}`, error);
    }
  }

  /**
   * Remove agente do room ao desconectar
   */
  async handleAgentDisconnect(
    client: Socket,
    server: Server,
    userId: number,
    userName: string,
  ) {
    try {
      const line = await this.agentsService.getAgentLine(userId);

      if (line) {
        // Notificar outros agentes
        this.emitToLineAgents(
          server,
          line.id,
          'agent-left',
          {
            agentId: userId,
            agentName: userName,
            timestamp: new Date(),
          },
          client.id,
        );

        // Buscar e emitir agentes online atualizados
        const onlineAgents = await this.agentsService.getOnlineAgentsByLine(
          line.id,
        );

        this.emitToLineAgents(server, line.id, 'agents-online-updated', {
          agents: onlineAgents,
          total: onlineAgents.length,
        });

        this.logger.log(
          `Agente ${userName} (ID: ${userId}) desconectado da linha ${line.id}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Erro ao processar desconexão do agente ${userId}`,
        error,
      );
    }
  }
}
