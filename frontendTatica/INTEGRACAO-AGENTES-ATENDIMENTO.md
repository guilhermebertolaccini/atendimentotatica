# 🎯 INTEGRAÇÃO DE AGENTES NA PÁGINA DE ATENDIMENTO

**Arquivo:** `src/pages/Atendimento.tsx`
**Complexidade:** Média
**Tempo Estimado:** 1-2 horas

---

## 📋 O QUE PRECISA SER FEITO

A página de Atendimento precisa de pequenas modificações para suportar o sistema de agentes com múltiplos agentes por linha.

### Mudanças Necessárias:

1. ✅ Adicionar estados para gerenciar agentes
2. ✅ Subscrever novos eventos WebSocket
3. ✅ Mostrar banner de "Modo Compartilhado"
4. ✅ Mostrar lista de agentes online
5. ✅ Indicar qual agente enviou cada mensagem
6. ✅ Implementar indicadores de "agente digitando"

---

## 🔧 PASSO 1: ADICIONAR IMPORTS

No topo do arquivo `Atendimento.tsx`, adicionar:

```typescript
import { agentsService, Agent, AgentLine } from "@/services/api";
import { Users, Bot } from "lucide-react"; // Adicionar ícones
```

---

## 🔧 PASSO 2: ADICIONAR ESTADOS

Logo após os estados existentes (procurar por `const [conversations, setConversations]`), adicionar:

```typescript
// ==================== ESTADOS DE AGENTES ====================
const [isAgentMode, setIsAgentMode] = useState(false); // Se é agente
const [agentLine, setAgentLine] = useState<AgentLine | null>(null); // Linha do agente
const [agentesOnline, setAgentesOnline] = useState<Agent[]>([]); // Agentes online na linha
const [typingAgents, setTypingAgents] = useState<Map<string, string>>(new Map()); // contactPhone -> agentName
```

---

## 🔧 PASSO 3: CARREGAR DADOS DE AGENTE (SE FOR AGENTE)

Adicionar novo useEffect logo após o useEffect que carrega conversas:

```typescript
// Carregar dados do agente (se for agente)
useEffect(() => {
  const loadAgentData = async () => {
    if (user?.role === "agente") {
      try {
        // Buscar linha do agente
        const line = await agentsService.getMyLine();
        if (line) {
          setAgentLine(line);
          setIsAgentMode(true);

          // Buscar agentes online da linha
          const agents = await agentsService.getOnlineByLine(line.id);
          setAgentesOnline(agents);
        }
      } catch (error) {
        console.error("Erro ao carregar dados do agente:", error);
      }
    }
  };

  loadAgentData();
}, [user]);
```

---

## 🔧 PASSO 4: SUBSCREVER EVENTOS DE AGENTES

Adicionar novos useRealtimeSubscription após os existentes:

```typescript
// ==================== EVENTOS DE AGENTES ====================

// Conversas carregadas (modo compartilhado)
useRealtimeSubscription(
  WS_EVENTS.CONVERSATIONS_LOADED,
  (data: any) => {
    console.log("[Atendimento] Conversas carregadas (modo agente):", data);

    if (data.mode === "shared") {
      setIsAgentMode(true);
      setAgentLine(data.lineInfo);

      // Carregar conversas
      if (data.conversations && Array.isArray(data.conversations)) {
        const grouped = groupConversations(data.conversations);
        setConversations(grouped);
      }
    }
  },
  []
);

// Agentes online atualizados
useRealtimeSubscription(
  WS_EVENTS.AGENTS_ONLINE_UPDATED,
  (data: any) => {
    console.log("[Atendimento] Agentes online atualizados:", data);
    if (data.agents) {
      setAgentesOnline(data.agents);
    }
  },
  []
);

// Agente entrou
useRealtimeSubscription(
  WS_EVENTS.AGENT_JOINED,
  (data: any) => {
    console.log("[Atendimento] Agente entrou:", data);
    toast.success("Novo agente entrou online", {
      duration: 2000,
    });
  },
  []
);

// Agente saiu
useRealtimeSubscription(
  WS_EVENTS.AGENT_LEFT,
  (data: any) => {
    console.log("[Atendimento] Agente saiu:", data);
    toast.info(`${data.agentName || "Agente"} desconectou`, {
      duration: 2000,
    });
  },
  []
);

// Agente digitando
useRealtimeSubscription(
  WS_EVENTS.AGENT_TYPING,
  (data: any) => {
    console.log("[Atendimento] Agente digitando:", data);
    setTypingAgents((prev) => {
      const newMap = new Map(prev);
      newMap.set(data.contactPhone, data.agentName);
      return newMap;
    });
  },
  []
);

// Agente parou de digitar
useRealtimeSubscription(
  WS_EVENTS.AGENT_STOPPED_TYPING,
  (data: any) => {
    console.log("[Atendimento] Agente parou de digitar:", data);
    setTypingAgents((prev) => {
      const newMap = new Map(prev);
      newMap.delete(data.contactPhone);
      return newMap;
    });
  },
  []
);

// Mensagem enviada (confirmação)
useRealtimeSubscription(
  WS_EVENTS.MESSAGE_SENT,
  (data: any) => {
    console.log("[Atendimento] Mensagem enviada (confirmação):", data);

    // Se for mensagem de outro agente, adicionar às conversas
    if (data.sentByAgentId && data.sentByAgentId !== user?.id) {
      const conversation = data.conversation;
      if (conversation) {
        setConversations((prevConvs) => {
          // ... lógica para adicionar mensagem (similar ao NEW_MESSAGE)
          return prevConvs;
        });
      }
    }
  },
  [user]
);
```

---

## 🔧 PASSO 5: ADICIONAR BANNER DE MODO COMPARTILHADO

Adicionar componente de banner no JSX, logo após o `<GlassCard>`:

```tsx
{/* Banner de Modo Compartilhado (Agentes) */}
{isAgentMode && agentLine && (
  <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        <span className="font-semibold text-blue-900 dark:text-blue-100">
          Modo Compartilhado
        </span>
      </div>
      <div className="text-sm text-blue-700 dark:text-blue-300">
        Linha: {agentLine.phone}
      </div>
      <div className="text-sm text-blue-700 dark:text-blue-300">
        •
      </div>
      <div className="text-sm text-blue-700 dark:text-blue-300">
        {agentesOnline.length} agente{agentesOnline.length !== 1 ? "s" : ""} online
      </div>
    </div>
  </div>
)}
```

---

## 🔧 PASSO 6: ADICIONAR LISTA DE AGENTES ONLINE

Adicionar sidebar de agentes online. Pode ser adicionado no grid principal:

```tsx
<div className="grid grid-cols-1 lg:grid-cols-[1fr_3fr_250px] gap-4">
  {/* Coluna 1: Lista de conversas */}
  <div className="lg:col-span-1">
    {/* ... código existente da lista de conversas ... */}
  </div>

  {/* Coluna 2: Chat */}
  <div className="lg:col-span-1">
    {/* ... código existente do chat ... */}
  </div>

  {/* Coluna 3: Agentes Online (NOVO) */}
  {isAgentMode && agentesOnline.length > 0 && (
    <div className="lg:col-span-1">
      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Agentes Online ({agentesOnline.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {agentesOnline.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent/50 transition-colors"
              >
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  agent.status === "Online" ? "bg-green-500" : "bg-gray-400"
                )} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{agent.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {agent.email}
                  </p>
                </div>
                {agent.id === Number(user?.id) && (
                  <Badge variant="outline" className="text-xs">
                    Você
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )}
</div>
```

---

## 🔧 PASSO 7: MOSTRAR QUAL AGENTE ENVIOU

Na função que renderiza mensagens, adicionar lógica para mostrar nome do agente:

Procurar onde as mensagens são renderizadas e modificar:

```tsx
{/* Renderizar mensagem */}
<div
  className={cn(
    "flex",
    msg.sender === "operator" ? "justify-end" : "justify-start"
  )}
>
  <div
    className={cn(
      "max-w-[70%] rounded-lg p-3",
      msg.sender === "operator"
        ? "bg-red-500 text-white" // Mensagem própria
        : "bg-white dark:bg-gray-800 text-foreground" // Mensagem do contato
    )}
  >
    {/* ADICIONAR: Se foi enviada por outro agente, mostrar nome */}
    {msg.sender === "operator" && msg.userName && msg.userName !== user?.name && (
      <div className="text-xs opacity-75 mb-1 flex items-center gap-1">
        <Bot className="h-3 w-3" />
        <span>Enviada por: {msg.userName}</span>
      </div>
    )}

    {/* Conteúdo da mensagem */}
    <div className="break-words">
      {/* ... código existente de renderização ... */}
    </div>

    {/* Timestamp */}
    <div className="text-xs opacity-75 mt-1 text-right">
      {formatTime(msg.datetime)}
    </div>
  </div>
</div>
```

---

## 🔧 PASSO 8: INDICADOR DE "AGENTE DIGITANDO"

Adicionar indicador de typing logo acima do input de mensagem:

```tsx
{/* Indicador de Agente Digitando */}
{selectedConversation && typingAgents.has(selectedConversation.contactPhone) && (
  <div className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground italic">
    <div className="flex gap-1">
      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
    </div>
    <span>{typingAgents.get(selectedConversation.contactPhone)} está digitando...</span>
  </div>
)}

{/* Input de mensagem */}
<div className="p-4 border-t">
  {/* ... código existente do input ... */}
</div>
```

---

## 🔧 PASSO 9: EMITIR EVENTOS DE TYPING

Modificar o input de mensagem para emitir eventos de typing:

```typescript
const [typingTimeout, setTypingTimeout] = useState<NodeJS.Timeout | null>(null);
const [isTyping, setIsTyping] = useState(false);

const handleMessageChange = (value: string) => {
  setMessage(value);

  // Se é agente, emitir evento de typing
  if (user?.role === "agente" && selectedConversation) {
    // Emitir start-typing
    if (!isTyping && value.length > 0) {
      realtimeSocket.send("start-typing", {
        contactPhone: selectedConversation.contactPhone,
      });
      setIsTyping(true);
    }

    // Limpar timeout anterior
    if (typingTimeout) {
      clearTimeout(typingTimeout);
    }

    // Definir novo timeout para stop-typing
    const timeout = setTimeout(() => {
      realtimeSocket.send("stop-typing", {
        contactPhone: selectedConversation.contactPhone,
      });
      setIsTyping(false);
    }, 3000); // 3 segundos sem digitar

    setTypingTimeout(timeout);
  }
};

// Ao enviar mensagem, parar typing
const handleSendMessage = async () => {
  // Limpar typing
  if (isTyping && user?.role === "agente" && selectedConversation) {
    realtimeSocket.send("stop-typing", {
      contactPhone: selectedConversation.contactPhone,
    });
    setIsTyping(false);
  }

  // ... código existente de envio ...
};
```

---

## ✅ CHECKLIST DE IMPLEMENTAÇÃO

- [ ] Adicionar imports (agentsService, Agent, AgentLine, ícones)
- [ ] Adicionar estados de agentes
- [ ] Adicionar useEffect para carregar dados do agente
- [ ] Adicionar useRealtimeSubscription para eventos de agentes
- [ ] Adicionar banner de "Modo Compartilhado"
- [ ] Adicionar sidebar de "Agentes Online"
- [ ] Modificar renderização de mensagens (mostrar nome do agente)
- [ ] Adicionar indicador de "agente digitando"
- [ ] Implementar emissão de eventos de typing
- [ ] Testar com múltiplos agentes

---

## 🎨 RESULTADO ESPERADO

Após implementação, o sistema terá:

✅ Banner azul indicando "Modo Compartilhado" para agentes
✅ Lista lateral com agentes online (com bolinha verde)
✅ Mensagens de outros agentes mostram "Enviada por: João Silva"
✅ Indicador animado "João Silva está digitando..."
✅ Notificações quando agente entra/sai
✅ Sincronização em tempo real de todas as mensagens

---

## 🐛 TROUBLESHOOTING

### Problema: Agente não vê conversas ao conectar
**Solução:** Verificar se o agente está vinculado a uma linha no banco de dados.

### Problema: Agentes online não aparecem
**Solução:** Verificar se o WebSocket está conectado e se o evento `agents-online-updated` está sendo recebido.

### Problema: Mensagens de outros agentes não aparecem
**Solução:** Verificar se está subscrito ao evento `message-sent` e `new_message`.

### Problema: Typing não funciona
**Solução:** Verificar se está emitindo `start-typing` e `stop-typing` corretamente.

---

## 📝 NOTAS IMPORTANTES

1. **Modo Compartilhado é APENAS para agentes** - Operadores normais continuam funcionando como antes
2. **Backward Compatible** - Operadores normais não são afetados
3. **Real-time** - Tudo sincronizado via WebSocket
4. **Fallback** - Se WebSocket cair, polling continua funcionando

---

**Criado por:** Claude Code
**Data:** 2026-01-08
