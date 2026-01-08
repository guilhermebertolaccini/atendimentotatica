-- =====================================================
-- MIGRATION: Sistema de Agentes - Múltiplos Agentes por Linha
-- Data: 2026-01-08
-- Descrição: Adiciona suporte para múltiplos agentes compartilhando uma única linha em tempo real
-- =====================================================

-- 1. Adicionar novo valor 'agente' ao enum Role
-- =====================================================
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'agente';

-- Verificar valores do enum
-- SELECT unnest(enum_range(NULL::Role));


-- 2. Adicionar campo agentId na tabela Conversation
-- =====================================================
-- Campo para identificar qual agente enviou a mensagem
ALTER TABLE "Conversation"
ADD COLUMN IF NOT EXISTS "agentId" INTEGER;

-- Criar índice para melhor performance
CREATE INDEX IF NOT EXISTS "Conversation_agentId_idx" ON "Conversation"("agentId");

-- Adicionar comentário
COMMENT ON COLUMN "Conversation"."agentId" IS 'ID do agente que enviou a mensagem (se for agente)';


-- 3. Criar tabela ConversationLineBinding
-- =====================================================
-- Vínculo entre conversa (contactPhone + lineId) e linha por 24 horas (para agentes)
-- Permite que todos os agentes da linha vejam a mesma conversa
CREATE TABLE IF NOT EXISTS "ConversationLineBinding" (
    "id" SERIAL PRIMARY KEY,
    "contactPhone" TEXT NOT NULL,
    "lineId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Foreign key para LinesStock
    CONSTRAINT "ConversationLineBinding_lineId_fkey"
        FOREIGN KEY ("lineId") REFERENCES "LinesStock"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- Constraint única: cada conversa vinculada a uma linha específica
CREATE UNIQUE INDEX IF NOT EXISTS "ConversationLineBinding_contactPhone_lineId_key"
    ON "ConversationLineBinding"("contactPhone", "lineId");

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS "ConversationLineBinding_contactPhone_lineId_idx"
    ON "ConversationLineBinding"("contactPhone", "lineId");

CREATE INDEX IF NOT EXISTS "ConversationLineBinding_lineId_idx"
    ON "ConversationLineBinding"("lineId");

CREATE INDEX IF NOT EXISTS "ConversationLineBinding_expiresAt_idx"
    ON "ConversationLineBinding"("expiresAt");

-- Adicionar comentários
COMMENT ON TABLE "ConversationLineBinding" IS 'Vínculo entre conversa e linha por 24h - todos os agentes da linha veem a mesma conversa';
COMMENT ON COLUMN "ConversationLineBinding"."contactPhone" IS 'Telefone do contato';
COMMENT ON COLUMN "ConversationLineBinding"."lineId" IS 'ID da linha vinculada';
COMMENT ON COLUMN "ConversationLineBinding"."expiresAt" IS 'Data/hora de expiração do vínculo (24h)';


-- 4. Criar tabela AgentMessageTracking
-- =====================================================
-- Rastreamento de mensagens enviadas por agentes
-- Permite saber qual agente enviou cada mensagem e gerar relatórios de produtividade
CREATE TABLE IF NOT EXISTS "AgentMessageTracking" (
    "id" SERIAL PRIMARY KEY,
    "conversationId" INTEGER NOT NULL,
    "agentId" INTEGER NOT NULL,
    "lineId" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Foreign keys
    CONSTRAINT "AgentMessageTracking_conversationId_fkey"
        FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT "AgentMessageTracking_agentId_fkey"
        FOREIGN KEY ("agentId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT "AgentMessageTracking_lineId_fkey"
        FOREIGN KEY ("lineId") REFERENCES "LinesStock"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS "AgentMessageTracking_conversationId_idx"
    ON "AgentMessageTracking"("conversationId");

CREATE INDEX IF NOT EXISTS "AgentMessageTracking_agentId_idx"
    ON "AgentMessageTracking"("agentId");

CREATE INDEX IF NOT EXISTS "AgentMessageTracking_lineId_idx"
    ON "AgentMessageTracking"("lineId");

CREATE INDEX IF NOT EXISTS "AgentMessageTracking_sentAt_idx"
    ON "AgentMessageTracking"("sentAt");

-- Índice composto para relatórios de produtividade por agente
CREATE INDEX IF NOT EXISTS "AgentMessageTracking_agentId_sentAt_idx"
    ON "AgentMessageTracking"("agentId", "sentAt");

-- Adicionar comentários
COMMENT ON TABLE "AgentMessageTracking" IS 'Rastreamento de mensagens enviadas por agentes - permite relatórios de produtividade';
COMMENT ON COLUMN "AgentMessageTracking"."conversationId" IS 'ID da conversa (mensagem)';
COMMENT ON COLUMN "AgentMessageTracking"."agentId" IS 'ID do agente que enviou';
COMMENT ON COLUMN "AgentMessageTracking"."lineId" IS 'ID da linha onde foi enviada';
COMMENT ON COLUMN "AgentMessageTracking"."sentAt" IS 'Data/hora de envio';


-- 5. Atualizar comentário da tabela LineOperator
-- =====================================================
COMMENT ON TABLE "LineOperator" IS 'Relacionamento entre Linhas e Operadores/Agentes (sem limite de operadores por linha para agentes)';


-- =====================================================
-- VERIFICAÇÕES PÓS-MIGRAÇÃO
-- =====================================================

-- Verificar se o enum Role contém 'agente'
-- SELECT unnest(enum_range(NULL::"Role"));

-- Verificar se as tabelas foram criadas
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- AND table_name IN ('ConversationLineBinding', 'AgentMessageTracking');

-- Verificar se o campo agentId foi adicionado
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'Conversation' AND column_name = 'agentId';

-- Verificar índices criados
-- SELECT indexname, tablename FROM pg_indexes
-- WHERE tablename IN ('Conversation', 'ConversationLineBinding', 'AgentMessageTracking')
-- ORDER BY tablename, indexname;


-- =====================================================
-- ROLLBACK (se necessário)
-- =====================================================
-- CUIDADO: Executar apenas se precisar reverter as mudanças

/*
-- Remover tabelas
DROP TABLE IF EXISTS "AgentMessageTracking" CASCADE;
DROP TABLE IF EXISTS "ConversationLineBinding" CASCADE;

-- Remover campo agentId
ALTER TABLE "Conversation" DROP COLUMN IF EXISTS "agentId";

-- Nota: Não é possível remover valores de um enum no PostgreSQL facilmente
-- Seria necessário recriar o enum, o que pode ser complexo em produção
-- ALTER TYPE "Role" RENAME TO "Role_old";
-- CREATE TYPE "Role" AS ENUM ('admin', 'operator', 'supervisor', 'ativador', 'digital');
-- ALTER TABLE "User" ALTER COLUMN role TYPE "Role" USING role::text::"Role";
-- DROP TYPE "Role_old";
*/


-- =====================================================
-- QUERIES ÚTEIS PARA TESTES
-- =====================================================

-- Criar um usuário agente (exemplo)
/*
INSERT INTO "User" (name, email, password, role, status)
VALUES ('Agente Teste', 'agente@teste.com', '$argon2...', 'agente', 'Offline');
*/

-- Vincular agente a uma linha (exemplo)
/*
INSERT INTO "LineOperator" ("lineId", "userId")
VALUES (1, (SELECT id FROM "User" WHERE email = 'agente@teste.com'));
*/

-- Buscar agentes de uma linha
/*
SELECT u.id, u.name, u.email, u.status
FROM "User" u
INNER JOIN "LineOperator" lo ON lo."userId" = u.id
WHERE u.role = 'agente' AND lo."lineId" = 1;
*/

-- Buscar estatísticas de um agente
/*
SELECT
    COUNT(*) as total_mensagens,
    COUNT(DISTINCT "conversationId") as conversas_atendidas,
    DATE("sentAt") as data
FROM "AgentMessageTracking"
WHERE "agentId" = 1
    AND "sentAt" >= NOW() - INTERVAL '30 days'
GROUP BY DATE("sentAt")
ORDER BY data DESC;
*/

-- Buscar conversas vinculadas a uma linha (não expiradas)
/*
SELECT clb.*, ls.phone as linha_phone
FROM "ConversationLineBinding" clb
INNER JOIN "LinesStock" ls ON ls.id = clb."lineId"
WHERE clb."expiresAt" > NOW()
ORDER BY clb."createdAt" DESC;
*/

-- Buscar quantos agentes estão online por linha
/*
SELECT
    lo."lineId",
    ls.phone as linha_phone,
    COUNT(*) as agentes_online
FROM "LineOperator" lo
INNER JOIN "User" u ON u.id = lo."userId"
INNER JOIN "LinesStock" ls ON ls.id = lo."lineId"
WHERE u.role = 'agente' AND u.status = 'Online'
GROUP BY lo."lineId", ls.phone
ORDER BY agentes_online DESC;
*/


-- =====================================================
-- FIM DA MIGRATION
-- =====================================================

-- Para aplicar esta migration:
-- psql -h SEU_HOST -U SEU_USUARIO -d SEU_DATABASE -f migrations/add_agent_system.sql

-- Ou via pgAdmin:
-- 1. Conectar ao banco
-- 2. Abrir Query Tool
-- 3. Colar o conteúdo deste arquivo
-- 4. Executar (F5)
