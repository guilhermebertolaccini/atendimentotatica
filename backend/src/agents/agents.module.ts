import { Module } from '@nestjs/common';
import { AgentsService } from './agents.service';
import { AgentsController } from './agents.controller';
import { PrismaService } from '../prisma.service';

/**
 * Módulo responsável por gerenciar agentes e suas operações
 *
 * Agentes são operadores com permissões restritas que compartilham linhas
 * em tempo real, permitindo que múltiplos agentes atendam na mesma linha.
 */
@Module({
  providers: [AgentsService, PrismaService],
  controllers: [AgentsController],
  exports: [AgentsService], // Exportar para uso em outros módulos (WebSocket, etc)
})
export class AgentsModule {}
