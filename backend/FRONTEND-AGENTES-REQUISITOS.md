# 📱 FRONTEND - REQUISITOS PARA SISTEMA DE AGENTES

**Status:** Guia de Implementação
**Complexidade:** Média
**Tempo Estimado:** 4-8 horas

---

## 🎯 O QUE PRECISA MUDAR NO FRONTEND

### 1️⃣ Login (Provavelmente NÃO precisa mexer)

Se o login já funciona assim, está OK:
```javascript
const response = await fetch('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email, password })
});

const { access_token, user } = await response.json();

// Salvar token
localStorage.setItem('token', access_token);
localStorage.setItem('user', JSON.stringify(user));
```

**O que muda:** Agora `user.role` pode ser `'agente'` (além de admin/operator/etc).

---

### 2️⃣ WebSocket - EVENTOS NOVOS (Obrigatório)

O frontend já deve ter WebSocket, mas precisa adicionar listeners para **novos eventos de agentes**.

#### 📥 Eventos que o Frontend RECEBE do Servidor

##### `conversations-loaded`
Quando agente conecta, recebe conversas no modo compartilhado.

```javascript
socket.on('conversations-loaded', (data) => {
  // data.mode = 'shared' (para agentes) ou undefined (operador normal)
  // data.lineId = ID da linha
  // data.conversations = array de conversas
  // data.lineInfo = { id, phone, segment }

  if (data.mode === 'shared') {
    // É AGENTE - modo compartilhado
    console.log('Modo Agente ativado!');
    console.log(`Linha compartilhada: ${data.lineInfo.phone}`);

    // Atualizar UI para mostrar que é modo compartilhado
    setModeCompartilhado(true);
    setLinhaInfo(data.lineInfo);
  }

  // Carregar conversas normalmente
  setConversations(data.conversations);
});
```

##### `agents-online-updated`
Lista de agentes online na linha atualizada.

```javascript
socket.on('agents-online-updated', (data) => {
  // data.agents = [{ id, name, email, status }]
  // data.total = número total

  console.log(`${data.total} agentes online:`, data.agents);

  // Atualizar UI
  setAgentesOnline(data.agents);
});
```

##### `agent-joined`
Novo agente entrou online.

```javascript
socket.on('agent-joined', (data) => {
  // data.agentId = ID do agente
  // data.timestamp = quando entrou

  showNotification('Novo agente entrou online');
});
```

##### `agent-left`
Agente saiu (desconectou).

```javascript
socket.on('agent-left', (data) => {
  // data.agentId = ID do agente
  // data.agentName = nome
  // data.timestamp = quando saiu

  showNotification(`${data.agentName} desconectou`);
});
```

##### `new_message` (MODIFICADO)
Nova mensagem agora tem informação de qual agente enviou.

```javascript
socket.on('new_message', (data) => {
  // NOVO: Campos adicionais para agentes
  // data.sentBy = nome de quem enviou (ex: "João Silva" ou "Cliente")
  // data.sentByAgentId = ID do agente (se for agente, senão null)
  // data.isIncoming = true se veio do cliente, false se de agente
  // data.conversation = objeto da conversa
  // data.timestamp = quando foi enviada

  const message = {
    ...data.conversation,
    sentByAgentName: data.sentBy,  // NOVO
    sentByAgentId: data.sentByAgentId,  // NOVO
    isIncoming: data.isIncoming,  // NOVO
  };

  // Adicionar à lista de mensagens
  addMessage(message);

  // Se for de outro agente, destacar de forma diferente
  if (data.sentByAgentId && data.sentByAgentId !== currentUser.id) {
    // Mostrar "João Silva enviou essa mensagem"
  }
});
```

##### `message-sent` (MODIFICADO)
Confirmação de mensagem enviada, agora com info do agente.

```javascript
socket.on('message-sent', (data) => {
  // NOVO: Campos adicionais
  // data.sentBy = nome do agente
  // data.sentByAgentId = ID do agente
  // data.conversation = objeto da conversa
  // data.timestamp = quando foi enviada

  // Atualizar UI com confirmação
  markMessageAsSent(data.conversation.id);
});
```

##### `agent-typing`
Outro agente está digitando para um cliente.

```javascript
socket.on('agent-typing', (data) => {
  // data.contactPhone = telefone do cliente
  // data.agentName = nome do agente digitando
  // data.agentId = ID do agente
  // data.timestamp = quando começou

  // Mostrar indicador "João está digitando..."
  showTypingIndicator(data.contactPhone, data.agentName);
});
```

##### `agent-stopped-typing`
Agente parou de digitar.

```javascript
socket.on('agent-stopped-typing', (data) => {
  // data.contactPhone = telefone do cliente
  // data.agentId = ID do agente

  // Remover indicador
  hideTypingIndicator(data.contactPhone, data.agentId);
});
```

#### 📤 Eventos que o Frontend EMITE para o Servidor

##### `start-typing` (NOVO)
Notificar que agente começou a digitar.

```javascript
// Quando o agente começar a digitar no input
const handleInputChange = (contactPhone) => {
  socket.emit('start-typing', { contactPhone });
};
```

##### `stop-typing` (NOVO)
Notificar que agente parou de digitar.

```javascript
// Quando o agente parar de digitar (ou enviar)
const handleStopTyping = (contactPhone) => {
  socket.emit('stop-typing', { contactPhone });
};
```

##### `send-message` (Já existe, não muda)
```javascript
socket.emit('send-message', {
  contactPhone: '5511888888888',
  contactName: 'Maria Santos',
  message: 'Olá!',
  messageType: 'text'
});
```

---

### 3️⃣ Interface - COMPONENTES NOVOS

#### A) Indicador de Modo Compartilhado

Mostrar que está em modo agente (múltiplos agentes na linha).

```jsx
// Exemplo React
function ModoCompartilhadoBanner({ lineInfo, agentesOnline }) {
  return (
    <div className="bg-blue-100 border border-blue-300 p-3 rounded">
      <div className="flex items-center gap-2">
        <UsersIcon className="w-5 h-5 text-blue-600" />
        <span className="font-semibold">Modo Compartilhado</span>
      </div>
      <div className="text-sm text-gray-600 mt-1">
        Linha: {lineInfo.phone} • {agentesOnline.length} agentes online
      </div>
    </div>
  );
}
```

#### B) Lista de Agentes Online

Mostrar quais agentes estão online na linha.

```jsx
function AgentesOnlineList({ agentes }) {
  return (
    <div className="border rounded p-3">
      <h3 className="font-semibold mb-2">Agentes Online ({agentes.length})</h3>
      <div className="space-y-2">
        {agentes.map(agente => (
          <div key={agente.id} className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-sm">{agente.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

#### C) Indicador de Qual Agente Enviou

Nas mensagens, mostrar quem enviou (para agentes).

```jsx
function Message({ message, currentUserId }) {
  const isFromOtherAgent =
    message.sentByAgentId &&
    message.sentByAgentId !== currentUserId;

  return (
    <div className={`message ${message.sender === 'operator' ? 'sent' : 'received'}`}>
      {/* Se foi enviada por outro agente, mostrar nome */}
      {isFromOtherAgent && (
        <div className="text-xs text-gray-500 mb-1">
          Enviada por: {message.sentByAgentName}
        </div>
      )}

      <div className="message-content">
        {message.message}
      </div>

      <div className="text-xs text-gray-400">
        {formatTime(message.datetime)}
      </div>
    </div>
  );
}
```

#### D) Indicador de "Agente Digitando"

Mostrar quando outro agente está digitando.

```jsx
function TypingIndicator({ typingAgents }) {
  if (typingAgents.length === 0) return null;

  const names = typingAgents.map(a => a.name).join(', ');

  return (
    <div className="text-sm text-gray-500 italic py-2">
      {names} {typingAgents.length === 1 ? 'está' : 'estão'} digitando...
    </div>
  );
}
```

---

### 4️⃣ Permissões - OCULTAR MENUS

Agentes NÃO devem ver alguns menus. Você precisa ocultar baseado no role.

```jsx
// Exemplo React
function Navigation({ user }) {
  const isAgente = user.role === 'agente';

  return (
    <nav>
      {/* Todos veem */}
      <NavItem href="/conversas" icon={ChatIcon}>Conversas</NavItem>
      <NavItem href="/contatos" icon={ContactIcon}>Contatos</NavItem>
      <NavItem href="/perfil" icon={UserIcon}>Perfil</NavItem>

      {/* Agentes NÃO veem */}
      {!isAgente && (
        <>
          <NavItem href="/supervisionar" icon={EyeIcon}>Supervisionar</NavItem>
          <NavItem href="/segmentos" icon={FolderIcon}>Segmentos</NavItem>
          <NavItem href="/templates" icon={FileIcon}>Templates</NavItem>
          <NavItem href="/operadores" icon={UsersIcon}>Operadores Online</NavItem>
          <NavItem href="/produtividade" icon={ChartIcon}>Produtividade</NavItem>
          <NavItem href="/painel" icon={SettingsIcon}>Painel de Controle</NavItem>
          <NavItem href="/tags" icon={TagIcon}>Tags</NavItem>
          <NavItem href="/logs" icon={ListIcon}>Logs API</NavItem>
        </>
      )}

      {/* Agentes veem apenas "Minhas Estatísticas" */}
      {isAgente && (
        <NavItem href="/minhas-stats" icon={ChartIcon}>Minhas Estatísticas</NavItem>
      )}
    </nav>
  );
}
```

---

### 5️⃣ Estado Global - GERENCIAR AGENTES

Adicionar estados para gerenciar informações de agentes.

```javascript
// Exemplo com Context API (React)
const AgentesContext = createContext();

export function AgentesProvider({ children }) {
  const [modoCompartilhado, setModoCompartilhado] = useState(false);
  const [linhaInfo, setLinhaInfo] = useState(null);
  const [agentesOnline, setAgentesOnline] = useState([]);
  const [typingAgents, setTypingAgents] = useState([]);

  // Listeners WebSocket
  useEffect(() => {
    socket.on('conversations-loaded', (data) => {
      if (data.mode === 'shared') {
        setModoCompartilhado(true);
        setLinhaInfo(data.lineInfo);
      }
    });

    socket.on('agents-online-updated', (data) => {
      setAgentesOnline(data.agents);
    });

    socket.on('agent-typing', (data) => {
      setTypingAgents(prev => [...prev, {
        id: data.agentId,
        name: data.agentName,
        contactPhone: data.contactPhone
      }]);
    });

    socket.on('agent-stopped-typing', (data) => {
      setTypingAgents(prev => prev.filter(a => a.id !== data.agentId));
    });

    return () => {
      socket.off('conversations-loaded');
      socket.off('agents-online-updated');
      socket.off('agent-typing');
      socket.off('agent-stopped-typing');
    };
  }, []);

  return (
    <AgentesContext.Provider value={{
      modoCompartilhado,
      linhaInfo,
      agentesOnline,
      typingAgents
    }}>
      {children}
    </AgentesContext.Provider>
  );
}
```

---

### 6️⃣ Input de Mensagem - ADICIONAR TYPING

Emitir eventos de typing quando agente digita.

```jsx
function MessageInput({ contactPhone }) {
  const [message, setMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef(null);

  const handleChange = (e) => {
    const value = e.target.value;
    setMessage(value);

    // Emitir start-typing
    if (!isTyping && value.length > 0) {
      socket.emit('start-typing', { contactPhone });
      setIsTyping(true);
    }

    // Resetar timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Se parar de digitar por 3 segundos, emitir stop-typing
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('stop-typing', { contactPhone });
      setIsTyping(false);
    }, 3000);
  };

  const handleSend = () => {
    // Emitir stop-typing ao enviar
    if (isTyping) {
      socket.emit('stop-typing', { contactPhone });
      setIsTyping(false);
    }

    // Enviar mensagem
    socket.emit('send-message', {
      contactPhone,
      message,
      messageType: 'text'
    });

    setMessage('');
  };

  return (
    <div>
      <input
        value={message}
        onChange={handleChange}
        placeholder="Digite sua mensagem..."
      />
      <button onClick={handleSend}>Enviar</button>
    </div>
  );
}
```

---

## 📋 CHECKLIST DE IMPLEMENTAÇÃO FRONTEND

### Eventos WebSocket
- [ ] Adicionar listener `conversations-loaded` (detectar modo compartilhado)
- [ ] Adicionar listener `agents-online-updated`
- [ ] Adicionar listener `agent-joined`
- [ ] Adicionar listener `agent-left`
- [ ] Modificar listener `new_message` (adicionar campos de agente)
- [ ] Modificar listener `message-sent` (adicionar campos de agente)
- [ ] Adicionar listener `agent-typing`
- [ ] Adicionar listener `agent-stopped-typing`
- [ ] Emitir `start-typing` quando digitar
- [ ] Emitir `stop-typing` quando parar

### Componentes UI
- [ ] Banner/indicador de "Modo Compartilhado"
- [ ] Lista de agentes online
- [ ] Indicador de qual agente enviou cada mensagem
- [ ] Indicador de "Agente está digitando..."
- [ ] Ajustar cores/estilos das mensagens de outros agentes

### Permissões
- [ ] Ocultar menu "Supervisionar" para agentes
- [ ] Ocultar menu "Segmentos" para agentes
- [ ] Ocultar menu "Templates" para agentes
- [ ] Ocultar menu "Operadores Online" para agentes
- [ ] Ocultar menu "Produtividade" para agentes
- [ ] Ocultar menu "Painel de Controle" para agentes
- [ ] Ocultar menu "Tags" para agentes
- [ ] Ocultar menu "Logs API" para agentes
- [ ] Adicionar menu "Minhas Estatísticas" para agentes

### Estado Global
- [ ] Estado `modoCompartilhado` (boolean)
- [ ] Estado `linhaInfo` (objeto com id, phone, segment)
- [ ] Estado `agentesOnline` (array)
- [ ] Estado `typingAgents` (array)

### Funcionalidades
- [ ] Input emite typing events
- [ ] Mensagens mostram nome do agente que enviou
- [ ] Notificações quando agente entra/sai
- [ ] Contador de agentes online visível

---

## 🎨 EXEMPLO DE TELA COMPLETA (CONCEITO)

```
┌─────────────────────────────────────────────────────────────┐
│  🟢 Modo Compartilhado                                      │
│  Linha: 5511999999999 • 3 agentes online                    │
└─────────────────────────────────────────────────────────────┘

┌──────────────┬──────────────────────────────────────────────┐
│              │  Chat com Maria Santos                        │
│  Conversas   │  5511888888888                                │
│              │                                                │
│  • Cliente 1 │  ┌──────────────────────────────────────┐    │
│  • Cliente 2 │  │ Cliente: Olá, preciso de ajuda       │    │
│  • Cliente 3 │  │ 10:30                                 │    │
│              │  └──────────────────────────────────────┘    │
│              │                                                │
│  Agentes     │         ┌─────────────────────────────┐      │
│  Online      │         │ João Silva: Claro! Como     │      │
│              │         │ posso ajudar?               │      │
│  🟢 João     │         │ 10:31                       │      │
│  🟢 Maria    │         └─────────────────────────────┘      │
│  🟢 Pedro    │                                                │
│              │  ┌──────────────────────────────────────┐    │
│              │  │ Cliente: Qual o prazo?               │    │
│              │  │ 10:32                                 │    │
│              │  └──────────────────────────────────────┘    │
│              │                                                │
│              │  ⌨️ Maria está digitando...                   │
│              │                                                │
│              │  ┌──────────────────────────────────────┐    │
│              │  │ [Digite sua mensagem...]             │    │
│              │  │                           [Enviar]   │    │
│              │  └──────────────────────────────────────┘    │
└──────────────┴──────────────────────────────────────────────┘
```

---

## ⏰ ESTIMATIVA DE TEMPO

- **Eventos WebSocket:** 1-2 horas
- **Componentes UI:** 2-3 horas
- **Permissões (ocultar menus):** 30 minutos
- **Estado Global:** 1 hora
- **Testes:** 1-2 horas

**TOTAL: 5-8 horas** (dependendo da complexidade do seu frontend)

---

## 🚨 IMPORTANTE

### O que NÃO precisa mexer:
- ✅ Login (já funciona)
- ✅ Envio de mensagem (já funciona, só adicionar campos na exibição)
- ✅ Estrutura básica de WebSocket (já existe)

### O que PRECISA mexer:
- ⚠️ Adicionar novos event listeners
- ⚠️ Criar componentes de agentes
- ⚠️ Ocultar menus para agentes
- ⚠️ Mostrar qual agente enviou cada mensagem
- ⚠️ Implementar typing indicators

---

## 📚 RECURSOS ÚTEIS

**Eventos WebSocket Completos:**
Ver `WEBSOCKET-INTEGRACAO-AGENTES.md` (seção "Eventos WebSocket")

**API REST de Agentes:**
Ver `IMPLEMENTACAO-COMPLETA-AGENTES.md` (seção "Endpoints da API")

**Permissões Detalhadas:**
Ver `src/common/configs/role-permissions.config.ts`

---

## ✅ RESUMO RÁPIDO

**Precisa mexer SIM, mas não é complicado!**

**3 coisas principais:**
1. Adicionar listeners WebSocket para novos eventos de agentes
2. Criar componentes visuais (lista de agentes, indicadores)
3. Ocultar menus que agentes não devem acessar

**Complexidade:** Média
**Tempo:** 5-8 horas
**Benefício:** Sistema completo e funcional!

---

**Criado por:** Claude Code
**Data:** 2026-01-08
