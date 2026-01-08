# SISTEMA DE MÚLTIPLOS AGENTES POR LINHA - SOLUÇÃO TÉCNICA COMPLETA

## 📋 VISÃO GERAL

### Objetivo
Transformar a arquitetura de "vários operadores + várias linhas" para "uma linha + vários agentes compartilhados", permitindo que até 10+ agentes trabalhem simultaneamente na mesma linha WhatsApp, vendo e respondendo às mesmas conversas em tempo real.

### Requisitos
1. **Novo cargo**: "Agente" - operador com permissões restritas
2. **Múltiplos agentes por linha**: Sem limite de 2 operadores (atual)
3. **Sincronização em tempo real**: Todos os agentes veem as mesmas conversas
4. **Rastreamento**: Saber qual agente enviou cada mensagem
5. **Permissões do Agente**: Acesso total EXCETO:
   - Supervisionar
   - Segmentos
   - Templates
   - Acompanhamento
   - Produtividade
   - Ativadores
   - Painel de controle
   - Operadores online
   - Tags
   - Logs API

---

## 🗄️ PARTE 1: MUDANÇAS NO BANCO DE DADOS

### 1.1. Adicionar novo Role "agente"

**Arquivo:** `prisma/schema.prisma`

```prisma
enum Role {
  admin
  operator
  supervisor
  ativador
  digital
  agente      // NOVO ROLE
}
```

### 1.2. Remover limitação de LineOperator

**Problema Atual:**
A tabela `LineOperator` usa uma constraint única `@@unique([lineId, userId])` que permite apenas um vínculo por operador-linha, e a lógica do backend limita a 2 operadores por linha.

**Solução:**
Manter a estrutura atual, mas:
1. Remover a lógica de limitação de "máximo 2 operadores" no código
2. Permitir múltiplos registros `LineOperator` para a mesma `lineId`
3. A constraint `@@unique([lineId, userId])` permanece (garante que o mesmo usuário não seja vinculado 2x na mesma linha)

**Nenhuma alteração necessária no schema** - apenas mudanças no código de validação.

### 1.3. Nova tabela: AgentMessageTracking

Para rastrear qual agente enviou cada mensagem:

```prisma
model AgentMessageTracking {
  id             Int       @id @default(autoincrement())
  conversationId Int       // FK para Conversation
  agentId        Int       // ID do agente que enviou
  lineId         Int       // Linha onde foi enviada
  sentAt         DateTime  @default(now())

  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  agent          User         @relation("AgentMessages", fields: [agentId], references: [id])
  line           LinesStock   @relation(fields: [lineId], references: [id])

  @@index([conversationId])
  @@index([agentId])
  @@index([lineId])
  @@index([sentAt])
}
```

**Propósito:**
- Registrar cada mensagem enviada por um agente
- Permitir relatórios de produtividade por agente
- Histórico de quem atendeu qual cliente
- Auditoria completa

### 1.4. Ajustes no modelo Conversation

Adicionar campo opcional para identificar o agente:

```prisma
model Conversation {
  id                    Int       @id @default(autoincrement())
  contactPhone          String
  contactName           String    @default("")
  segment               Int?
  userId                Int?      // Mantém para compatibilidade
  agentId               Int?      // NOVO: ID do agente que enviou (se for agente)
  message               String    @db.Text
  sender                Sender
  datetime              DateTime  @default(now())
  tabulation            Int?
  messageType           String    @default("text")
  mediaUrl              String?
  archived              Boolean   @default(false)
  isGroup               Boolean   @default(false)
  groupId               String?

  agentTracking         AgentMessageTracking[]  // NOVO

  @@index([contactPhone])
  @@index([userId])
  @@index([agentId])      // NOVO
  @@index([tabulation])
  @@index([archived, datetime])
}
```

### 1.5. Ajustes no modelo ConversationOperatorBinding

**Problema Atual:**
Esta tabela vincula uma conversa a UM operador por 24h. Com múltiplos agentes, todos devem ver a mesma conversa.

**Solução:**
Criar uma nova abordagem onde conversas são vinculadas à **linha** (não ao operador individual), e todos os agentes da linha têm acesso.

**Nova tabela:** ConversationLineBinding

```prisma
model ConversationLineBinding {
  id           Int      @id @default(autoincrement())
  contactPhone String
  lineId       Int      // Vinculada à linha (não ao operador)
  expiresAt    DateTime
  createdAt    DateTime @default(now())

  line         LinesStock @relation(fields: [lineId], references: [id], onDelete: Cascade)

  @@unique([contactPhone, lineId])
  @@index([expiresAt])
  @@index([lineId])
}
```

**Mudança conceitual:**
- **Antes**: Conversa vinculada a 1 operador específico
- **Depois**: Conversa vinculada à linha (todos os agentes da linha veem)

**IMPORTANTE:** Manter `ConversationOperatorBinding` para operadores normais (role: operator), usar `ConversationLineBinding` para agentes.

---

## 🔧 PARTE 2: MUDANÇAS NO CÓDIGO

### 2.1. Atualizar o Enum Role

**Arquivo:** `src/common/enums/role.enum.ts`

```typescript
export enum Role {
  admin = 'admin',
  operator = 'operator',
  supervisor = 'supervisor',
  ativador = 'ativador',
  digital = 'digital',
  agente = 'agente',  // NOVO
}
```

### 2.2. Configurar Permissões do Role "agente"

**Arquivo:** Criar `src/common/configs/role-permissions.config.ts`

```typescript
export const ROLE_PERMISSIONS = {
  agente: {
    // Acesso permitido
    allowed: [
      'conversations:read',
      'conversations:send',
      'conversations:tabulate',
      'contacts:read',
      'contacts:update',
      'blocklist:read',
      'blocklist:create',
      'reports:basic',        // Apenas seus próprios relatórios
      'campaigns:read',
      'campaigns:send',
      'message-queue:read',
      'api-messages:send',
      'media:upload',
      'media:read',
      'profile:read',
      'profile:update',
    ],

    // Acesso negado
    denied: [
      'segments:*',           // Não acessa segmentos
      'templates:*',          // Não acessa templates
      'users:*',              // Não gerencia usuários
      'lines:*',              // Não gerencia linhas
      'control-panel:*',      // Não acessa painel de controle
      'tabulations:*',        // Não cria/edita tabulações
      'reports:advanced',     // Não acessa relatórios avançados
      'productivity:*',       // Não acessa produtividade
      'ativadores:*',         // Não acessa ativadores
      'operator-queue:*',     // Não acessa fila de operadores
      'system-events:*',      // Não acessa logs/eventos
      'tags:*',               // Não acessa tags
      'api-logs:*',           // Não acessa logs de API
      'operators-online:*',   // Não acessa lista de operadores online
      'supervision:*',        // Não supervisiona
      'campaigns:create',     // Não cria campanhas (só envia)
      'campaigns:delete',
    ],
  },

  operator: {
    allowed: ['*'],  // Operador normal mantém acessos atuais
    denied: [],
  },

  // ... outros roles
};

// Helper function
export function hasPermission(role: Role, permission: string): boolean {
  const rolePerms = ROLE_PERMISSIONS[role];
  if (!rolePerms) return false;

  // Verifica se está explicitamente negado
  if (rolePerms.denied.some(p => {
    if (p.endsWith(':*')) {
      return permission.startsWith(p.replace(':*', ''));
    }
    return p === permission;
  })) {
    return false;
  }

  // Verifica se está permitido
  return rolePerms.allowed.includes('*') ||
         rolePerms.allowed.includes(permission) ||
         rolePerms.allowed.some(p => p.endsWith(':*') && permission.startsWith(p.replace(':*', '')));
}
```

### 2.3. Criar Guard de Permissões

**Arquivo:** `src/common/guards/permissions.guard.ts`

```typescript
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasPermission } from '../configs/role-permissions.config';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.get<string[]>(
      'permissions',
      context.getHandler(),
    );

    if (!requiredPermissions) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.role) {
      return false;
    }

    // Admin tem acesso total
    if (user.role === 'admin') {
      return true;
    }

    // Verifica cada permissão requerida
    return requiredPermissions.every(permission =>
      hasPermission(user.role, permission)
    );
  }
}
```

**Arquivo:** `src/common/decorators/permissions.decorator.ts`

```typescript
import { SetMetadata } from '@nestjs/common';

export const Permissions = (...permissions: string[]) =>
  SetMetadata('permissions', permissions);
```

### 2.4. Atualizar Controllers com Permissões

**Exemplo:** `src/users/users.controller.ts`

```typescript
import { Permissions } from '../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {

  @Get()
  @Permissions('users:read')  // Agentes NÃO têm esta permissão
  findAll() {
    // ...
  }

  @Get('me')
  @Permissions('profile:read')  // Agentes TÊM esta permissão
  getProfile(@Request() req) {
    // ...
  }
}
```

**Aplicar em todos os controllers:**
- `users.controller.ts` - Bloquear acesso de agentes
- `segments.controller.ts` - Bloquear acesso de agentes
- `templates.controller.ts` - Bloquear acesso de agentes
- `control-panel.controller.ts` - Bloquear acesso de agentes
- `tabulations.controller.ts` - Bloquear acesso de agentes
- `reports.controller.ts` - Permitir apenas relatórios básicos
- `campaigns.controller.ts` - Permitir leitura, bloquear criação
- `conversations.controller.ts` - Permitir acesso total
- `contacts.controller.ts` - Permitir acesso total
- `blocklist.controller.ts` - Permitir acesso total

### 2.5. Remover Limitação de Operadores por Linha

**Arquivo:** `src/lines/lines.service.ts`

**Buscar e remover/comentar:**
```typescript
// ANTES (remover esta validação):
const operatorCount = await this.prisma.lineOperator.count({
  where: { lineId: id },
});

if (operatorCount >= 2) {
  throw new BadRequestException('Esta linha já possui 2 operadores.');
}
```

**DEPOIS:**
```typescript
// Permitir múltiplos operadores por linha (sem limite)
// Validar apenas se o usuário já está vinculado
const existingBinding = await this.prisma.lineOperator.findUnique({
  where: {
    lineId_userId: { lineId: id, userId: operatorId },
  },
});

if (existingBinding) {
  throw new BadRequestException('Este operador já está vinculado a esta linha.');
}
```

### 2.6. Criar Serviço para Agentes

**Arquivo:** `src/agents/agents.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AgentsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Retorna todos os agentes vinculados a uma linha
   */
  async getAgentsByLine(lineId: number) {
    return this.prisma.user.findMany({
      where: {
        role: 'agente',
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
  }

  /**
   * Retorna a linha de um agente
   */
  async getAgentLine(agentId: number) {
    const lineOperator = await this.prisma.lineOperator.findFirst({
      where: { userId: agentId },
      include: { line: true },
    });

    return lineOperator?.line || null;
  }

  /**
   * Vincula um agente a uma linha
   */
  async assignAgentToLine(agentId: number, lineId: number) {
    // Validar se o usuário é agente
    const user = await this.prisma.user.findUnique({
      where: { id: agentId },
    });

    if (user.role !== 'agente') {
      throw new Error('Usuário não é um agente');
    }

    // Criar vínculo (se não existir)
    return this.prisma.lineOperator.upsert({
      where: {
        lineId_userId: { lineId, userId: agentId },
      },
      create: {
        lineId,
        userId: agentId,
      },
      update: {},
    });
  }

  /**
   * Remove um agente de uma linha
   */
  async removeAgentFromLine(agentId: number, lineId: number) {
    return this.prisma.lineOperator.delete({
      where: {
        lineId_userId: { lineId, userId: agentId },
      },
    });
  }

  /**
   * Retorna todas as conversas ativas da linha do agente
   */
  async getAgentConversations(agentId: number) {
    const line = await this.getAgentLine(agentId);

    if (!line) {
      return [];
    }

    // Buscar conversas vinculadas à linha (não ao agente individual)
    const bindings = await this.prisma.conversationLineBinding.findMany({
      where: {
        lineId: line.id,
        expiresAt: { gt: new Date() },
      },
    });

    const contactPhones = bindings.map(b => b.contactPhone);

    // Buscar últimas mensagens de cada conversa
    const conversations = await this.prisma.conversation.findMany({
      where: {
        contactPhone: { in: contactPhones },
        tabulation: null,  // Apenas conversas ativas
      },
      orderBy: { datetime: 'desc' },
      distinct: ['contactPhone'],
    });

    return conversations;
  }

  /**
   * Registra uma mensagem enviada por um agente
   */
  async trackAgentMessage(
    conversationId: number,
    agentId: number,
    lineId: number,
  ) {
    return this.prisma.agentMessageTracking.create({
      data: {
        conversationId,
        agentId,
        lineId,
      },
    });
  }

  /**
   * Retorna estatísticas de um agente
   */
  async getAgentStats(agentId: number, startDate: Date, endDate: Date) {
    const messagesSent = await this.prisma.agentMessageTracking.count({
      where: {
        agentId,
        sentAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    const conversationsHandled = await this.prisma.agentMessageTracking.findMany({
      where: {
        agentId,
        sentAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      distinct: ['conversationId'],
    });

    return {
      messagesSent,
      conversationsHandled: conversationsHandled.length,
    };
  }
}
```

### 2.7. Atualizar WebSocket Gateway

**Arquivo:** `src/websocket/websocket.gateway.ts`

**Mudanças necessárias:**

#### 2.7.1. Ao conectar, carregar conversas da linha (não do operador)

```typescript
async handleConnection(client: Socket) {
  try {
    // ... validação JWT e busca do usuário ...

    // Se for agente, buscar conversas da LINHA (não do operador individual)
    if (user.role === 'agente') {
      const line = await this.agentsService.getAgentLine(user.id);

      if (line) {
        // Carregar conversas ativas da linha
        const conversations = await this.agentsService.getAgentConversations(user.id);

        client.emit('conversations-loaded', {
          conversations,
          lineId: line.id,
          mode: 'shared',  // Indica que é modo compartilhado
        });

        // Juntar ao room da linha para receber atualizações em tempo real
        client.join(`line-${line.id}`);
      }
    } else {
      // Lógica atual para operadores normais
      // ...
    }

  } catch (error) {
    this.logger.error('Erro na conexão WebSocket', error);
    client.disconnect();
  }
}
```

#### 2.7.2. Ao enviar mensagem, registrar qual agente enviou

```typescript
@SubscribeMessage('send-message')
async handleSendMessage(
  @ConnectedSocket() client: Socket,
  @MessageBody() payload: any,
) {
  try {
    const user = await this.getUserFromSocket(client);

    // ... validações existentes ...

    // Enviar mensagem via Evolution
    const result = await this.messageSendingService.sendMessage({
      phone: payload.contactPhone,
      message: payload.message,
      // ...
    });

    // Salvar no banco
    const conversation = await this.conversationsService.create({
      contactPhone: payload.contactPhone,
      message: payload.message,
      sender: 'operator',
      userId: user.id,
      agentId: user.role === 'agente' ? user.id : null,  // NOVO
      // ...
    });

    // Se for agente, registrar no tracking
    if (user.role === 'agente') {
      const line = await this.agentsService.getAgentLine(user.id);

      await this.agentsService.trackAgentMessage(
        conversation.id,
        user.id,
        line.id,
      );
    }

    // Emitir para o próprio agente
    client.emit('message-sent', {
      conversation,
      sentBy: user.name,  // NOVO: Nome do agente que enviou
      sentByAgentId: user.role === 'agente' ? user.id : null,
    });

    // Emitir para todos os agentes da linha
    const line = await this.agentsService.getAgentLine(user.id);
    if (line) {
      this.server.to(`line-${line.id}`).emit('new_message', {
        conversation,
        sentBy: user.name,  // NOVO
        sentByAgentId: user.role === 'agente' ? user.id : null,
      });
    }

  } catch (error) {
    this.logger.error('Erro ao enviar mensagem', error);
    client.emit('message-error', { error: error.message });
  }
}
```

#### 2.7.3. Ao receber mensagem do cliente, emitir para todos os agentes da linha

```typescript
async handleIncomingMessage(messageData: any) {
  try {
    const contactPhone = messageData.from;

    // Buscar qual linha está vinculada a este contato
    const binding = await this.prisma.conversationLineBinding.findFirst({
      where: {
        contactPhone,
        expiresAt: { gt: new Date() },
      },
    });

    if (!binding) {
      // Criar novo vínculo com a primeira linha disponível (ou lógica customizada)
      // ...
    }

    // Salvar mensagem
    const conversation = await this.conversationsService.create({
      contactPhone,
      message: messageData.body,
      sender: 'contact',
      // ...
    });

    // Emitir para TODOS os agentes da linha
    this.server.to(`line-${binding.lineId}`).emit('new_message', {
      conversation,
      sentBy: 'Cliente',
      isIncoming: true,
    });

  } catch (error) {
    this.logger.error('Erro ao processar mensagem recebida', error);
  }
}
```

### 2.8. Criar Módulo de Agentes

**Arquivo:** `src/agents/agents.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { AgentsService } from './agents.service';
import { AgentsController } from './agents.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [AgentsService],
  controllers: [AgentsController],
  exports: [AgentsService],
})
export class AgentsModule {}
```

**Arquivo:** `src/agents/agents.controller.ts`

```typescript
import { Controller, Get, Post, Delete, Param, Body, UseGuards, Request } from '@nestjs/common';
import { AgentsService } from './agents.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';

@Controller('agents')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AgentsController {
  constructor(private agentsService: AgentsService) {}

  @Get('line/:lineId')
  @Permissions('users:read')  // Apenas admin/supervisor
  async getAgentsByLine(@Param('lineId') lineId: string) {
    return this.agentsService.getAgentsByLine(+lineId);
  }

  @Get('me/line')
  @Permissions('profile:read')  // Agentes podem ver sua própria linha
  async getMyLine(@Request() req) {
    return this.agentsService.getAgentLine(req.user.userId);
  }

  @Get('me/conversations')
  @Permissions('conversations:read')  // Agentes podem ver conversas
  async getMyConversations(@Request() req) {
    return this.agentsService.getAgentConversations(req.user.userId);
  }

  @Get('me/stats')
  @Permissions('reports:basic')  // Agentes podem ver suas próprias estatísticas
  async getMyStats(
    @Request() req,
    @Body() body: { startDate: string; endDate: string },
  ) {
    return this.agentsService.getAgentStats(
      req.user.userId,
      new Date(body.startDate),
      new Date(body.endDate),
    );
  }

  @Post(':agentId/line/:lineId')
  @Permissions('users:manage')  // Apenas admin
  async assignToLine(
    @Param('agentId') agentId: string,
    @Param('lineId') lineId: string,
  ) {
    return this.agentsService.assignAgentToLine(+agentId, +lineId);
  }

  @Delete(':agentId/line/:lineId')
  @Permissions('users:manage')  // Apenas admin
  async removeFromLine(
    @Param('agentId') agentId: string,
    @Param('lineId') lineId: string,
  ) {
    return this.agentsService.removeAgentFromLine(+agentId, +lineId);
  }
}
```

### 2.9. Atualizar AppModule

**Arquivo:** `src/app.module.ts`

```typescript
import { AgentsModule } from './agents/agents.module';

@Module({
  imports: [
    // ... outros módulos ...
    AgentsModule,  // ADICIONAR
  ],
})
export class AppModule {}
```

---

## 🚀 PARTE 3: MIGRAÇÃO DO BANCO DE DADOS

### 3.1. Criar Migration do Prisma

**Passo 1:** Atualizar `prisma/schema.prisma` com todas as mudanças acima

**Passo 2:** Gerar migration

```bash
npx prisma migrate dev --name add_agent_role_and_tracking
```

### 3.2. Script de Migração de Dados (se necessário)

Se houver operadores atuais que devem virar agentes:

**Arquivo:** `prisma/migrations/migration-script.ts`

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateOperatorsToAgents() {
  // Exemplo: converter operadores de um segmento específico em agentes
  const operatorsToMigrate = await prisma.user.findMany({
    where: {
      role: 'operator',
      segment: 5,  // Exemplo: segmento 5
    },
  });

  for (const operator of operatorsToMigrate) {
    await prisma.user.update({
      where: { id: operator.id },
      data: { role: 'agente' },
    });

    console.log(`Migrado operador ${operator.name} (ID: ${operator.id}) para agente`);
  }

  console.log(`Total migrado: ${operatorsToMigrate.length} operadores → agentes`);
}

migrateOperatorsToAgents()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

---

## 📱 PARTE 4: INTERFACE DO FRONTEND (CONSIDERAÇÕES)

### 4.1. Indicador Visual de Agentes Ativos

O frontend deve mostrar:
- Quantos agentes estão online na mesma linha
- Quem está digitando em tempo real
- Qual agente enviou cada mensagem (avatar/nome)

### 4.2. Sincronização em Tempo Real

**Eventos WebSocket necessários:**

```typescript
// Cliente recebe quando outro agente envia mensagem
socket.on('new_message', (data) => {
  // data.sentBy = nome do agente
  // data.sentByAgentId = ID do agente
  // Atualizar UI mostrando quem enviou
});

// Cliente recebe quando agente está digitando
socket.on('agent-typing', (data) => {
  // data.agentName = "João Silva está digitando..."
});

// Cliente recebe lista de agentes online na linha
socket.on('agents-online-updated', (data) => {
  // data.agents = [{id, name, status}]
});
```

### 4.3. Conflitos de Digitação

**Problema:** Dois agentes tentam responder ao mesmo cliente simultaneamente.

**Solução:**
1. **Lock suave**: Mostrar aviso "Outro agente está respondendo este cliente"
2. **Lock forte** (opcional): Bloquear input temporariamente
3. **Mesclagem**: Permitir que ambos enviem, mas avisar

**Implementação no WebSocket:**

```typescript
@SubscribeMessage('start-typing')
async handleStartTyping(
  @ConnectedSocket() client: Socket,
  @MessageBody() payload: { contactPhone: string },
) {
  const user = await this.getUserFromSocket(client);
  const line = await this.agentsService.getAgentLine(user.id);

  if (line && user.role === 'agente') {
    // Emitir para outros agentes da linha
    client.to(`line-${line.id}`).emit('agent-typing', {
      contactPhone: payload.contactPhone,
      agentName: user.name,
      agentId: user.id,
    });
  }
}

@SubscribeMessage('stop-typing')
async handleStopTyping(
  @ConnectedSocket() client: Socket,
  @MessageBody() payload: { contactPhone: string },
) {
  const user = await this.getUserFromSocket(client);
  const line = await this.agentsService.getAgentLine(user.id);

  if (line && user.role === 'agente') {
    client.to(`line-${line.id}`).emit('agent-stopped-typing', {
      contactPhone: payload.contactPhone,
      agentId: user.id,
    });
  }
}
```

---

## 🧪 PARTE 5: TESTES E VALIDAÇÃO

### 5.1. Cenários de Teste

#### Teste 1: Criar Agente e Vincular à Linha
```
1. Criar usuário com role: 'agente'
2. Vincular agente à linha X
3. Verificar que LineOperator foi criado
4. Conectar via WebSocket
5. Verificar que recebeu conversas da linha
```

#### Teste 2: Múltiplos Agentes na Mesma Linha
```
1. Vincular 10 agentes à linha X
2. Verificar que todos foram vinculados (sem limite de 2)
3. Cliente envia mensagem para a linha X
4. Verificar que todos os 10 agentes receberam a mensagem
```

#### Teste 3: Rastreamento de Mensagens
```
1. Agente A envia mensagem ao cliente
2. Verificar que Conversation.agentId = A
3. Verificar que AgentMessageTracking foi criado com agentId = A
4. Agente B envia mensagem ao mesmo cliente
5. Verificar que Conversation.agentId = B (nova mensagem)
6. Verificar tracking separado para cada agente
```

#### Teste 4: Permissões
```
1. Tentar acessar /segments com agente → deve retornar 403
2. Tentar acessar /templates com agente → deve retornar 403
3. Tentar acessar /conversations com agente → deve retornar 200
4. Tentar acessar /me com agente → deve retornar 200
```

#### Teste 5: Sincronização em Tempo Real
```
1. Conectar 3 agentes na mesma linha
2. Agente 1 envia mensagem
3. Verificar que Agentes 2 e 3 receberam via WebSocket
4. Cliente responde
5. Verificar que todos os 3 agentes receberam
```

### 5.2. Testes Unitários

**Arquivo:** `src/agents/agents.service.spec.ts`

```typescript
import { Test } from '@nestjs/testing';
import { AgentsService } from './agents.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AgentsService', () => {
  let service: AgentsService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [AgentsService, PrismaService],
    }).compile();

    service = module.get(AgentsService);
    prisma = module.get(PrismaService);
  });

  it('deve retornar agentes de uma linha', async () => {
    const agents = await service.getAgentsByLine(1);
    expect(Array.isArray(agents)).toBe(true);
  });

  it('deve rastrear mensagem de agente', async () => {
    const tracking = await service.trackAgentMessage(1, 10, 5);
    expect(tracking.agentId).toBe(10);
    expect(tracking.lineId).toBe(5);
  });
});
```

---

## 📊 PARTE 6: MONITORAMENTO E RELATÓRIOS

### 6.1. Métricas por Agente

**Arquivo:** `src/reports/reports.service.ts`

Adicionar métodos:

```typescript
async getAgentPerformance(agentId: number, startDate: Date, endDate: Date) {
  const messagesSent = await this.prisma.agentMessageTracking.count({
    where: {
      agentId,
      sentAt: { gte: startDate, lte: endDate },
    },
  });

  const uniqueConversations = await this.prisma.agentMessageTracking.groupBy({
    by: ['conversationId'],
    where: {
      agentId,
      sentAt: { gte: startDate, lte: endDate },
    },
  });

  const avgResponseTime = await this.calculateAvgResponseTime(agentId, startDate, endDate);

  return {
    agentId,
    messagesSent,
    conversationsHandled: uniqueConversations.length,
    avgResponseTimeSeconds: avgResponseTime,
  };
}

async getLinePerformance(lineId: number, startDate: Date, endDate: Date) {
  const agents = await this.agentsService.getAgentsByLine(lineId);

  const agentStats = await Promise.all(
    agents.map(agent => this.getAgentPerformance(agent.id, startDate, endDate))
  );

  return {
    lineId,
    totalMessages: agentStats.reduce((sum, s) => sum + s.messagesSent, 0),
    totalConversations: agentStats.reduce((sum, s) => sum + s.conversationsHandled, 0),
    agents: agentStats,
  };
}
```

### 6.2. Dashboard para Supervisores

Criar endpoint para supervisores visualizarem:
- Quantos agentes estão online em cada linha
- Produtividade individual de cada agente
- Tempo médio de resposta
- Conversas atendidas por agente

---

## 🔒 PARTE 7: SEGURANÇA E BOAS PRÁTICAS

### 7.1. Validações Importantes

```typescript
// Ao vincular agente à linha
- Verificar se o usuário tem role 'agente'
- Verificar se a linha existe e está ativa
- Verificar se o segmento do agente (se houver) bate com o da linha

// Ao enviar mensagem
- Verificar se o agente está vinculado à linha
- Rate limiting por agente (não por linha)
- Validar que a conversa pertence à linha do agente

// Ao buscar conversas
- Retornar apenas conversas da linha do agente
- Não expor conversas de outras linhas
```

### 7.2. Logs e Auditoria

**Arquivo:** `src/system-events/system-events.service.ts`

Adicionar eventos:

```typescript
enum SystemEventType {
  // ... eventos existentes ...
  AGENT_ASSIGNED_TO_LINE = 'agent_assigned_to_line',
  AGENT_REMOVED_FROM_LINE = 'agent_removed_from_line',
  AGENT_MESSAGE_SENT = 'agent_message_sent',
  AGENT_LOGIN = 'agent_login',
  AGENT_LOGOUT = 'agent_logout',
}
```

Registrar cada ação importante para auditoria.

---

## 📝 PARTE 8: CHECKLIST DE IMPLEMENTAÇÃO

### 8.1. Backend

- [ ] Atualizar `prisma/schema.prisma` com novo role 'agente'
- [ ] Adicionar tabela `AgentMessageTracking`
- [ ] Adicionar campo `agentId` em `Conversation`
- [ ] Adicionar tabela `ConversationLineBinding`
- [ ] Rodar `prisma migrate dev`
- [ ] Atualizar enum `Role` no código
- [ ] Criar `role-permissions.config.ts`
- [ ] Criar `PermissionsGuard`
- [ ] Criar `AgentsService`
- [ ] Criar `AgentsController`
- [ ] Criar `AgentsModule`
- [ ] Atualizar `WebsocketGateway`:
  - [ ] Carregar conversas da linha (não do operador)
  - [ ] Emitir mensagens para todos da linha
  - [ ] Registrar agente que enviou
  - [ ] Implementar `agent-typing`
- [ ] Remover limitação de 2 operadores em `lines.service.ts`
- [ ] Atualizar todos os controllers com `@Permissions`
- [ ] Adicionar métodos de relatórios por agente
- [ ] Implementar logs de auditoria
- [ ] Escrever testes unitários
- [ ] Escrever testes de integração

### 8.2. Frontend (considerações)

- [ ] Adicionar indicador "X agentes online"
- [ ] Mostrar avatar/nome do agente que enviou cada mensagem
- [ ] Implementar notificação "Outro agente está digitando..."
- [ ] Atualizar tela de login para suportar role 'agente'
- [ ] Ocultar menus não permitidos para agentes
- [ ] Adicionar dashboard de performance individual do agente

### 8.3. DevOps

- [ ] Rodar migration em ambiente de staging
- [ ] Testar com carga (10 agentes simultâneos)
- [ ] Configurar monitoramento de WebSocket
- [ ] Documentar API no Swagger
- [ ] Atualizar documentação para equipe

---

## 🎯 PARTE 9: VANTAGENS DA SOLUÇÃO

### 9.1. Escalabilidade
- Permite adicionar quantos agentes forem necessários
- Sem limite artificial de operadores por linha
- Sistema de tracking permite análise granular

### 9.2. Rastreabilidade
- Cada mensagem registra qual agente enviou
- Auditoria completa de ações
- Relatórios individuais de performance

### 9.3. Sincronização em Tempo Real
- WebSocket com Socket.IO garante atualização instantânea
- Todos os agentes veem o mesmo estado
- Notificações de typing em tempo real

### 9.4. Separação de Responsabilidades
- Agentes têm permissões restritas
- Não acessam configurações sensíveis
- Focam apenas em atendimento

### 9.5. Compatibilidade
- Mantém funcionalidade atual para operadores normais
- Sistema de permissões flexível
- Fácil adicionar novos roles no futuro

---

## ⚠️ PARTE 10: CONSIDERAÇÕES E PONTOS DE ATENÇÃO

### 10.1. Performance

**Problema:** 10 agentes recebendo todas as mensagens via WebSocket pode gerar tráfego alto.

**Solução:**
- Implementar compressão WebSocket (já suportado pelo Socket.IO)
- Usar `rooms` do Socket.IO (já previsto na solução)
- Enviar apenas diffs de mensagens (não reenviar histórico completo)

### 10.2. Conflitos de Atendimento

**Problema:** Dois agentes tentam responder ao mesmo cliente simultaneamente.

**Solução:**
- Implementar sistema de "lock suave" (aviso visual)
- Opcionalmente, lock forte de 30 segundos após primeira interação
- Mostrar histórico completo para evitar respostas duplicadas

### 10.3. Distribuição de Carga

**Problema:** Alguns agentes podem ficar ociosos enquanto outros sobrecarregados.

**Solução:**
- Implementar distribuição automática de conversas novas
- Round-robin ou baseado em carga atual
- Dashboard para supervisor redistribuir manualmente se necessário

### 10.4. Migração de Dados

**Problema:** Conversas existentes estão vinculadas a operadores individuais.

**Solução:**
- Criar script de migração para converter `ConversationOperatorBinding` em `ConversationLineBinding`
- Buscar linha do operador e migrar vínculo
- Manter tabela antiga por 30 dias para rollback

---

## 📚 PARTE 11: DOCUMENTAÇÃO DA API

### 11.1. Novos Endpoints

#### GET /agents/line/:lineId
Retorna todos os agentes de uma linha.

**Permissão:** `users:read` (admin/supervisor)

**Resposta:**
```json
[
  {
    "id": 10,
    "name": "João Silva",
    "email": "joao@example.com",
    "status": "Online"
  }
]
```

#### GET /agents/me/line
Retorna a linha do agente logado.

**Permissão:** `profile:read` (agente)

**Resposta:**
```json
{
  "id": 5,
  "phone": "551199999999",
  "lineStatus": "Active",
  "segment": 2
}
```

#### GET /agents/me/conversations
Retorna conversas ativas da linha do agente.

**Permissão:** `conversations:read` (agente)

**Resposta:**
```json
[
  {
    "id": 123,
    "contactPhone": "5511888888888",
    "contactName": "Maria Santos",
    "message": "Olá, preciso de ajuda",
    "sender": "contact",
    "datetime": "2025-01-08T10:30:00Z"
  }
]
```

#### GET /agents/me/stats
Retorna estatísticas do agente.

**Permissão:** `reports:basic` (agente)

**Body:**
```json
{
  "startDate": "2025-01-01T00:00:00Z",
  "endDate": "2025-01-08T23:59:59Z"
}
```

**Resposta:**
```json
{
  "messagesSent": 150,
  "conversationsHandled": 45
}
```

#### POST /agents/:agentId/line/:lineId
Vincula um agente a uma linha.

**Permissão:** `users:manage` (admin)

**Resposta:**
```json
{
  "id": 50,
  "lineId": 5,
  "userId": 10
}
```

#### DELETE /agents/:agentId/line/:lineId
Remove vínculo de agente com linha.

**Permissão:** `users:manage` (admin)

**Resposta:**
```json
{
  "success": true
}
```

### 11.2. Eventos WebSocket

#### conversations-loaded (servidor → cliente)
Enviado ao conectar, com conversas da linha.

```json
{
  "conversations": [...],
  "lineId": 5,
  "mode": "shared"
}
```

#### new_message (servidor → cliente)
Nova mensagem na linha (de agente ou cliente).

```json
{
  "conversation": {...},
  "sentBy": "João Silva",
  "sentByAgentId": 10,
  "isIncoming": false
}
```

#### message-sent (servidor → cliente)
Confirmação de mensagem enviada.

```json
{
  "conversation": {...},
  "sentBy": "João Silva",
  "sentByAgentId": 10
}
```

#### agent-typing (servidor → cliente)
Notifica que outro agente está digitando.

```json
{
  "contactPhone": "5511888888888",
  "agentName": "Maria Oliveira",
  "agentId": 12
}
```

#### agent-stopped-typing (servidor → cliente)
Notifica que agente parou de digitar.

```json
{
  "contactPhone": "5511888888888",
  "agentId": 12
}
```

#### agents-online-updated (servidor → cliente)
Atualização de agentes online na linha.

```json
{
  "agents": [
    {"id": 10, "name": "João Silva", "status": "Online"},
    {"id": 12, "name": "Maria Oliveira", "status": "Online"}
  ]
}
```

---

## 🚦 PARTE 12: PLANO DE ROLLOUT

### Fase 1: Desenvolvimento (1 semana)
- Implementar mudanças no banco de dados
- Criar serviços e controllers
- Atualizar WebSocket

### Fase 2: Testes (3 dias)
- Testes unitários
- Testes de integração
- Testes de carga (10+ agentes simultâneos)

### Fase 3: Staging (5 dias)
- Deploy em ambiente de staging
- Testes com usuários reais (1-2 agentes)
- Ajustes de performance

### Fase 4: Produção (Rollout gradual)
- Dia 1: Lançar para 1 linha com 2 agentes
- Dia 3: Aumentar para 5 agentes
- Dia 7: Aumentar para 10 agentes
- Monitorar métricas e feedback

### Fase 5: Expansão
- Aplicar para demais linhas conforme necessidade
- Treinar novos agentes
- Coletar feedback e iterar

---

## 📞 PARTE 13: SUPORTE E MANUTENÇÃO

### 13.1. Logs Importantes

Monitorar:
- Erros de conexão WebSocket de agentes
- Mensagens não sincronizadas
- Falhas no tracking de mensagens
- Picos de latência

### 13.2. Métricas

Acompanhar:
- Número médio de agentes por linha
- Tempo médio de sincronização de mensagens
- Taxa de sucesso de envio
- Performance do banco (queries lentas)

### 13.3. Troubleshooting

**Problema:** Agente não recebe mensagens em tempo real
- Verificar conexão WebSocket
- Verificar se está no room `line-{lineId}`
- Verificar logs do servidor

**Problema:** Mensagem não registra qual agente enviou
- Verificar se `AgentMessageTracking` foi criado
- Verificar campo `agentId` em `Conversation`
- Verificar logs de erro

---

## ✅ CONCLUSÃO

Esta solução completa permite implementar um sistema robusto de múltiplos agentes compartilhando uma única linha WhatsApp em tempo real.

### Principais Benefícios:
✅ Escalável (10+ agentes por linha)
✅ Rastreável (cada mensagem registra o agente)
✅ Sincronizado (tempo real via WebSocket)
✅ Seguro (permissões granulares)
✅ Auditável (logs completos)
✅ Compatível (mantém funcionalidades atuais)

### Próximos Passos:
1. Revisar este documento com a equipe
2. Aprovar arquitetura proposta
3. Iniciar implementação fase por fase
4. Testar extensivamente
5. Fazer rollout gradual

---

**Autor:** Claude Code
**Data:** 2026-01-08
**Versão:** 1.0
