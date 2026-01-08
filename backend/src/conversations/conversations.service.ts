import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';

@Injectable()
export class ConversationsService {
  constructor(private prisma: PrismaService) {}

  async create(createConversationDto: CreateConversationDto) {
    return this.prisma.conversation.create({
      data: {
        ...createConversationDto,
        datetime: new Date(),
      },
    });
  }

  async findAll(filters?: any) {
    // Remover campos inválidos que não existem no schema
    const { search, ...validFilters } = filters || {};
    
    // Se houver busca por texto, aplicar filtros
    const where = search 
      ? {
          ...validFilters,
          OR: [
            { contactName: { contains: search, mode: 'insensitive' } },
            { contactPhone: { contains: search } },
            { message: { contains: search, mode: 'insensitive' } },
          ],
        }
      : validFilters;

    return this.prisma.conversation.findMany({
      where,
      orderBy: {
        datetime: 'desc',
      },
    });
  }

  async findByContactPhone(contactPhone: string, tabulated: boolean = false, userId?: number) {
    const where: any = {
      contactPhone,
      tabulation: tabulated ? { not: null } : null,
    };

    // IMPORTANTE: Se for operador, filtrar por userId (não por userLine)
    // Isso permite que as conversas continuem aparecendo mesmo se a linha foi banida
    if (userId) {
      where.userId = userId;
    }

    return this.prisma.conversation.findMany({
      where,
      orderBy: {
        datetime: 'asc',
      },
    });
  }

  async findActiveConversations(userLine?: number, userId?: number) {
    const where: any = {
      tabulation: null,
    };

    // IMPORTANTE: Para operadores, buscar apenas por userId (não por userLine)
    // Isso permite que as conversas continuem aparecendo mesmo se a linha foi banida
    if (userId) {
      where.userId = userId;
    } else if (userLine) {
      // Fallback: se não tiver userId, usar userLine (para compatibilidade)
      where.userLine = userLine;
    }

    // Retornar TODAS as mensagens não tabuladas (SEM LIMITE - histórico completo)
    // O frontend vai agrupar por contactPhone/groupId
    const conversations = await this.prisma.conversation.findMany({
      where,
      orderBy: {
        datetime: 'asc', // Ordem cronológica para histórico
      },
      // SEM take/limit - carregar todo o histórico
    });

    return conversations;
  }

  async findTabulatedConversations(userLine?: number, userId?: number) {
    const where: any = {
      tabulation: { not: null },
    };

    // IMPORTANTE: Para operadores, buscar apenas por userId (não por userLine)
    // Isso permite que as conversas tabuladas continuem aparecendo mesmo se a linha foi banida
    if (userId) {
      where.userId = userId;
    } else if (userLine) {
      // Fallback: se não tiver userId, usar userLine (para compatibilidade)
      where.userLine = userLine;
    }

    // Retornar TODAS as mensagens tabuladas (o frontend vai agrupar)
    const conversations = await this.prisma.conversation.findMany({
      where,
      orderBy: {
        datetime: 'asc', // Ordem cronológica para histórico
      },
    });

    return conversations;
  }

  /**
   * Buscar conversas ativas de múltiplos operadores (modo linha compartilhada)
   */
  async findActiveConversationsByUserIds(userIds: number[]) {
    return this.prisma.conversation.findMany({
      where: {
        userId: { in: userIds },
        tabulation: null,
      },
      orderBy: {
        datetime: 'asc',
      },
    });
  }

  /**
   * Buscar conversas tabuladas de múltiplos operadores (modo linha compartilhada)
   */
  async findTabulatedConversationsByUserIds(userIds: number[]) {
    return this.prisma.conversation.findMany({
      where: {
        userId: { in: userIds },
        tabulation: { not: null },
      },
      orderBy: {
        datetime: 'asc',
      },
    });
  }

  async findOne(id: number) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversa com ID ${id} não encontrada`);
    }

    return conversation;
  }

  async update(id: number, updateConversationDto: UpdateConversationDto) {
    await this.findOne(id);

    return this.prisma.conversation.update({
      where: { id },
      data: updateConversationDto,
    });
  }

  async tabulateConversation(contactPhone: string, tabulationId: number) {
    // Atualizar todas as mensagens daquele contactPhone que ainda não foram tabuladas
    return this.prisma.conversation.updateMany({
      where: {
        contactPhone,
        tabulation: null,
      },
      data: {
        tabulation: tabulationId,
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);

    return this.prisma.conversation.delete({
      where: { id },
    });
  }

  async getConversationsBySegment(segment: number, tabulated: boolean = false) {
    return this.prisma.conversation.findMany({
      where: {
        segment,
        tabulation: tabulated ? { not: null } : null,
      },
      orderBy: {
        datetime: 'desc',
      },
    });
  }

  /**
   * Rechamar contato após linha banida
   * Cria uma nova conversa ativa para o contato na nova linha do operador
   */
  async recallContact(contactPhone: string, userId: number, userLine: number | null) {
    if (!userLine) {
      throw new NotFoundException('Operador não possui linha atribuída');
    }

    // Buscar contato
    const contact = await this.prisma.contact.findFirst({
      where: { phone: contactPhone },
    });

    if (!contact) {
      throw new NotFoundException('Contato não encontrado');
    }

    // Buscar última conversa com este contato para pegar dados
    const lastConversation = await this.prisma.conversation.findFirst({
      where: { contactPhone },
      orderBy: { datetime: 'desc' },
    });

    // Buscar dados do operador
    const operator = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!operator) {
      throw new NotFoundException('Operador não encontrado');
    }

    // Criar nova conversa ativa (não tabulada) na nova linha
    const newConversation = await this.prisma.conversation.create({
      data: {
        contactName: contact.name,
        contactPhone: contact.phone,
        segment: contact.segment || lastConversation?.segment || operator.segment,
        userName: operator.name,
        userLine: userLine,
        userId: userId,
        message: 'Contato rechamado após linha banida',
        sender: 'operator',
        messageType: 'text',
        tabulation: null, // Conversa ativa
      },
    });

    return newConversation;
  }

  /**
   * Buscar conversas ativas da linha (para agentes)
   * Agentes veem todas as conversas da linha, não apenas as suas
   *
   * @param lineId - ID da linha
   * @returns Array de conversas ativas
   */
  async findActiveConversationsByLine(lineId: number) {
    // Buscar conversas vinculadas à linha (não expiradas)
    const bindings = await this.prisma.conversationLineBinding.findMany({
      where: {
        lineId,
        expiresAt: { gt: new Date() },
      },
    });

    if (bindings.length === 0) {
      return [];
    }

    const contactPhones = bindings.map((b) => b.contactPhone);

    // Buscar todas as mensagens das conversas vinculadas
    return this.prisma.conversation.findMany({
      where: {
        contactPhone: { in: contactPhones },
        tabulation: null, // Apenas conversas ativas
      },
      orderBy: {
        datetime: 'asc',
      },
    });
  }

  /**
   * Criar conversa com tracking de agente
   *
   * @param createConversationDto - DTO da conversa
   * @param agentId - ID do agente (se for agente)
   * @param lineId - ID da linha (para tracking)
   * @returns Conversa criada
   */
  async createWithAgentTracking(
    createConversationDto: CreateConversationDto,
    agentId?: number,
    lineId?: number,
  ) {
    // Criar conversa
    const conversation = await this.prisma.conversation.create({
      data: {
        ...createConversationDto,
        agentId: agentId || null,
        datetime: new Date(),
      },
    });

    // Se for agente, criar tracking
    if (agentId && lineId && conversation.sender === 'operator') {
      await this.prisma.agentMessageTracking.create({
        data: {
          conversationId: conversation.id,
          agentId,
          lineId,
        },
      });
    }

    return conversation;
  }

  /**
   * Vincular conversa à linha (para agentes)
   *
   * @param contactPhone - Telefone do contato
   * @param lineId - ID da linha
   * @param expiresInHours - Horas até expirar (padrão: 24h)
   * @returns Binding criado/atualizado
   */
  async bindConversationToLine(
    contactPhone: string,
    lineId: number,
    expiresInHours: number = 24,
  ) {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiresInHours);

    return this.prisma.conversationLineBinding.upsert({
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
  }

  /**
   * Buscar linha vinculada a uma conversa
   *
   * @param contactPhone - Telefone do contato
   * @returns Binding ou null
   */
  async getConversationLineBinding(contactPhone: string) {
    return this.prisma.conversationLineBinding.findFirst({
      where: {
        contactPhone,
        expiresAt: { gt: new Date() },
      },
      include: {
        line: {
          select: {
            id: true,
            phone: true,
            evolutionName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}
