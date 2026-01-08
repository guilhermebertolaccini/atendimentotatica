# INTEGRAÇÃO DE AGENTES NO WEBSOCKET GATEWAY

Este documento descreve as modificações necessárias no `websocket.gateway.ts` para suportar o sistema de agentes.

## ✅ HELPER JÁ CRIADO

Foi criado o arquivo `agents-websocket.helper.ts` com todas as funções auxiliares para agentes.

---

## 📝 MODIFICAÇÕES NO WEBSOCKET.GATEWAY.TS

### 1. Adicionar Imports

No topo do arquivo, adicionar:

```typescript
import { AgentsWebSocketHelper } from './agents-websocket.helper';
import { AgentsService } from '../agents/agents.service';
import { Role } from '@prisma/client';
```

### 2. Injetar Dependências no Constructor

Adicionar no constructor:

```typescript
constructor(
  // ... existentes ...
  private agentsService: AgentsService, // ADICIONAR
) {
  // Criar instância do helper
  this.agentsHelper = new AgentsWebSocketHelper(
    this.prisma,
    this.agentsService,
    this.conversationsService,
  );
}
```

### 3. Declarar Helper como Propriedade da Classe

Adicionar após as outras propriedades:

```typescript
export class WebsocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  // ... outras propriedades ...

  private agentsHelper: AgentsWebSocketHelper; // ADICIONAR
```

### 4. Modificar handleConnection

No método `handleConnection`, após buscar o usuário e antes de carregar conversas:

```typescript
async handleConnection(client: Socket) {
  try {
    // ... código existente de autenticação ...

    // Buscar usuário
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { lineOperators: { include: { line: true } } },
    });

    if (!user) {
      // ... código existente ...
      return;
    }

    // ========== ADICIONAR ESTE BLOCO ==========
    // Se for agente, usar lógica específica de agentes
    if (user.role === Role.agente) {
      this.logger.log(`🟢 Agente ${user.name} (ID: ${user.id}) conectado`);

      // Armazenar socket do agente
      this.connectedUsers.set(user.id, client.id);

      // Marcar como online
      await this.prisma.user.update({
        where: { id: user.id },
        data: { status: 'Online' },
      });

      // Carregar conversas da linha (modo compartilhado)
      await this.agentsHelper.loadAgentConversations(client, user.id, this.server);

      return; // Não executar lógica de operador normal
    }
    // ========== FIM DO BLOCO ==========

    // Código existente para operadores normais continua aqui...
  } catch (error) {
    // ... código existente ...
  }
}
```

### 5. Modificar handleSendMessage

No método `@SubscribeMessage('send-message')`:

```typescript
@SubscribeMessage('send-message')
async handleSendMessage(
  @ConnectedSocket() client: Socket,
  @MessageBody() payload: any,
) {
  try {
    // Buscar usuário
    const user = await this.getUserFromSocket(client);

    if (!user) {
      client.emit('error', { message: 'Usuário não autenticado' });
      return;
    }

    // ... validações existentes ...

    // Enviar mensagem via Evolution
    const result = await this.messageSendingService.sendMessage({
      phone: payload.contactPhone,
      message: payload.message,
      // ... outros parâmetros
    });

    // Salvar no banco
    let conversation;

    // ========== ADICIONAR ESTE BLOCO ==========
    // Se for agente, usar método com tracking
    if (user.role === Role.agente) {
      const line = await this.agentsService.getAgentLine(user.id);

      if (!line) {
        client.emit('error', { message: 'Você não está vinculado a uma linha' });
        return;
      }

      conversation = await this.conversationsService.createWithAgentTracking(
        {
          contactPhone: payload.contactPhone,
          contactName: payload.contactName || 'Sem nome',
          message: payload.message,
          sender: 'operator',
          userId: user.id,
          userLine: line.id,
          userName: user.name,
          segment: payload.segment,
          messageType: payload.messageType || 'text',
          mediaUrl: payload.mediaUrl,
        },
        user.id, // agentId
        line.id, // lineId
      );

      // Processar mensagem de agente (tracking + emitir para outros)
      await this.agentsHelper.processAgentMessage(
        client,
        this.server,
        user.id,
        user.name,
        conversation.id,
        payload.contactPhone,
      );

      return; // Não executar lógica de operador normal
    }
    // ========== FIM DO BLOCO ==========

    // Código existente para operadores normais continua aqui...
    conversation = await this.conversationsService.create({
      // ...
    });

    // ... resto do código existente ...
  } catch (error) {
    // ... código existente ...
  }
}
```

### 6. Adicionar Handler para Typing

Adicionar novo método:

```typescript
/**
 * Handler para evento de typing (agente está digitando)
 */
@SubscribeMessage('start-typing')
async handleStartTyping(
  @ConnectedSocket() client: Socket,
  @MessageBody() payload: { contactPhone: string },
) {
  try {
    const user = await this.getUserFromSocket(client);

    if (!user || user.role !== Role.agente) {
      return;
    }

    await this.agentsHelper.processAgentTyping(
      client,
      this.server,
      user.id,
      user.name,
      payload.contactPhone,
      true, // isTyping = true
    );
  } catch (error) {
    this.logger.error('Erro ao processar start-typing', error);
  }
}

/**
 * Handler para evento de stop typing
 */
@SubscribeMessage('stop-typing')
async handleStopTyping(
  @ConnectedSocket() client: Socket,
  @MessageBody() payload: { contactPhone: string },
) {
  try {
    const user = await this.getUserFromSocket(client);

    if (!user || user.role !== Role.agente) {
      return;
    }

    await this.agentsHelper.processAgentTyping(
      client,
      this.server,
      user.id,
      user.name,
      payload.contactPhone,
      false, // isTyping = false
    );
  } catch (error) {
    this.logger.error('Erro ao processar stop-typing', error);
  }
}
```

### 7. Modificar handleDisconnect

No método `handleDisconnect`:

```typescript
async handleDisconnect(client: Socket) {
  try {
    const user = await this.getUserFromSocket(client);

    if (!user) {
      return;
    }

    // ========== ADICIONAR ESTE BLOCO ==========
    // Se for agente, usar lógica específica
    if (user.role === Role.agente) {
      await this.agentsHelper.handleAgentDisconnect(
        client,
        this.server,
        user.id,
        user.name,
      );

      // Remover do mapa de usuários conectados
      this.connectedUsers.delete(user.id);

      // Marcar como offline
      await this.prisma.user.update({
        where: { id: user.id },
        data: { status: 'Offline' },
      });

      this.logger.log(`🔴 Agente ${user.name} (ID: ${user.id}) desconectado`);
      return;
    }
    // ========== FIM DO BLOCO ==========

    // Código existente para operadores normais continua aqui...
  } catch (error) {
    // ... código existente ...
  }
}
```

### 8. Modificar Processamento de Mensagens Recebidas (Webhook)

Se houver um método que processa mensagens recebidas do webhook (ex: `processIncomingMessage`), adicionar:

```typescript
async processIncomingMessage(messageData: any) {
  try {
    const contactPhone = messageData.from;

    // Salvar mensagem no banco
    const conversation = await this.conversationsService.create({
      contactPhone,
      contactName: messageData.pushName || 'Sem nome',
      message: messageData.body,
      sender: 'contact',
      // ... outros campos
    });

    // ========== ADICIONAR ESTE BLOCO ==========
    // Processar para agentes (se houver binding com linha de agentes)
    await this.agentsHelper.processIncomingMessageForAgents(
      this.server,
      contactPhone,
      conversation,
    );
    // ========== FIM DO BLOCO ==========

    // Código existente para operadores normais continua aqui...
  } catch (error) {
    // ... código existente ...
  }
}
```

---

## 🔧 MÓDULO WEBSOCKET

### Atualizar websocket.module.ts

Adicionar `AgentsModule` aos imports:

```typescript
import { Module } from '@nestjs/common';
import { WebsocketGateway } from './websocket.gateway';
import { AgentsModule } from '../agents/agents.module'; // ADICIONAR
// ... outros imports

@Module({
  imports: [
    // ... outros imports
    AgentsModule, // ADICIONAR
  ],
  providers: [WebsocketGateway],
})
export class WebsocketModule {}
```

---

## 📊 EVENTOS WEBSOCKET PARA AGENTES

### Eventos Enviados pelo Servidor (Server → Cliente)

#### `conversations-loaded`
Conversas carregadas ao conectar (modo compartilhado).

```json
{
  "conversations": [...],
  "lineId": 5,
  "mode": "shared",
  "lineInfo": {
    "id": 5,
    "phone": "551199999999",
    "segment": 2
  }
}
```

#### `agents-online-updated`
Lista de agentes online na linha atualizada.

```json
{
  "agents": [
    {"id": 10, "name": "João Silva", "email": "joao@example.com", "status": "Online"}
  ],
  "total": 3
}
```

#### `agent-joined`
Novo agente entrou online na linha.

```json
{
  "agentId": 10,
  "timestamp": "2025-01-08T10:30:00Z"
}
```

#### `agent-left`
Agente saiu (desconectou).

```json
{
  "agentId": 10,
  "agentName": "João Silva",
  "timestamp": "2025-01-08T11:30:00Z"
}
```

#### `new_message`
Nova mensagem (de agente ou cliente).

```json
{
  "conversation": {...},
  "sentBy": "João Silva",
  "sentByAgentId": 10,
  "isIncoming": false,
  "timestamp": "2025-01-08T10:32:00Z"
}
```

#### `message-sent`
Confirmação de mensagem enviada.

```json
{
  "conversation": {...},
  "sentBy": "João Silva",
  "sentByAgentId": 10,
  "timestamp": "2025-01-08T10:32:00Z"
}
```

#### `agent-typing`
Agente está digitando.

```json
{
  "contactPhone": "5511888888888",
  "agentName": "Maria Oliveira",
  "agentId": 12,
  "timestamp": "2025-01-08T10:32:15Z"
}
```

#### `agent-stopped-typing`
Agente parou de digitar.

```json
{
  "contactPhone": "5511888888888",
  "agentId": 12,
  "timestamp": "2025-01-08T10:32:20Z"
}
```

### Eventos Enviados pelo Cliente (Cliente → Server)

#### `send-message`
Enviar mensagem para cliente.

```json
{
  "contactPhone": "5511888888888",
  "contactName": "Maria Santos",
  "message": "Olá, como posso ajudar?",
  "messageType": "text",
  "segment": 2
}
```

#### `start-typing`
Agente começou a digitar.

```json
{
  "contactPhone": "5511888888888"
}
```

#### `stop-typing`
Agente parou de digitar.

```json
{
  "contactPhone": "5511888888888"
}
```

---

## ✅ CHECKLIST DE INTEGRAÇÃO

- [ ] Adicionar imports no topo do arquivo
- [ ] Injetar `AgentsService` no constructor
- [ ] Criar instância do `AgentsWebSocketHelper`
- [ ] Modificar `handleConnection` para agentes
- [ ] Modificar `handleSendMessage` para agentes
- [ ] Adicionar handlers `start-typing` e `stop-typing`
- [ ] Modificar `handleDisconnect` para agentes
- [ ] Modificar processamento de mensagens recebidas
- [ ] Atualizar `websocket.module.ts` com `AgentsModule`
- [ ] Testar conexão de agentes
- [ ] Testar envio de mensagens
- [ ] Testar sincronização em tempo real entre múltiplos agentes

---

## 🧪 TESTES SUGERIDOS

### Teste 1: Conexão de Agente
1. Criar usuário com role `agente`
2. Vincular a uma linha
3. Conectar via WebSocket
4. Verificar evento `conversations-loaded`
5. Verificar evento `agents-online-updated`

### Teste 2: Múltiplos Agentes
1. Conectar 3 agentes na mesma linha
2. Cliente envia mensagem
3. Verificar que todos os 3 receberam via WebSocket

### Teste 3: Rastreamento
1. Agente A envia mensagem
2. Verificar que outros agentes receberam com `sentByAgentId`
3. Verificar que `AgentMessageTracking` foi criado no banco
4. Verificar que `Conversation.agentId` está correto

### Teste 4: Typing
1. Agente A emite `start-typing`
2. Verificar que Agentes B e C receberam `agent-typing`
3. Agente A emite `stop-typing`
4. Verificar que B e C receberam `agent-stopped-typing`

---

## 📚 REFERÊNCIAS

- **Helper de Agentes:** `src/websocket/agents-websocket.helper.ts`
- **Serviço de Agentes:** `src/agents/agents.service.ts`
- **Serviço de Conversas:** `src/conversations/conversations.service.ts`
- **Documentação Completa:** `SISTEMA-AGENTES-MULTIPLOS.md`

---

**Implementado por:** Claude Code
**Data:** 2026-01-08
