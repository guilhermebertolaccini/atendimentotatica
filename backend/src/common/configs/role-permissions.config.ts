import { Role } from '@prisma/client';

/**
 * Configuração de permissões por role
 *
 * Cada role tem uma lista de permissões permitidas e negadas.
 * As permissões seguem o padrão: "recurso:ação"
 * Exemplos: "conversations:read", "users:create", "reports:advanced"
 *
 * Uso do wildcard (*):
 * - "allowed: ['*']" = permite tudo
 * - "denied: ['segments:*']" = nega todas as ações de segments
 */

export interface RolePermissions {
  allowed: string[];
  denied: string[];
}

export const ROLE_PERMISSIONS: Record<Role, RolePermissions> = {
  /**
   * ADMIN - Acesso total ao sistema
   */
  admin: {
    allowed: ['*'],
    denied: [],
  },

  /**
   * OPERATOR - Operador com acesso total (funcionalidade atual mantida)
   */
  operator: {
    allowed: ['*'],
    denied: [],
  },

  /**
   * SUPERVISOR - Supervisiona equipe e acessa relatórios
   */
  supervisor: {
    allowed: [
      'conversations:*',
      'contacts:*',
      'reports:*',
      'segments:read',
      'users:read',
      'lines:read',
      'campaigns:*',
      'templates:read',
      'tabulations:read',
      'tags:read',
      'blocklist:*',
      'profile:*',
      'productivity:*',
      'supervision:*',
    ],
    denied: [
      'users:create',
      'users:update',
      'users:delete',
      'lines:create',
      'lines:update',
      'lines:delete',
      'segments:create',
      'segments:update',
      'segments:delete',
      'control-panel:*',
      'system-events:*',
      'api-logs:*',
    ],
  },

  /**
   * ATIVADOR - Cria e gerencia linhas
   */
  ativador: {
    allowed: [
      'lines:*',
      'evolution:*',
      'contacts:read',
      'profile:*',
      'reports:basic',
    ],
    denied: [
      'users:*',
      'segments:*',
      'templates:*',
      'campaigns:*',
      'conversations:*',
      'control-panel:*',
      'tabulations:*',
      'blocklist:*',
      'system-events:*',
      'api-logs:*',
      'tags:*',
      'reports:advanced',
      'productivity:*',
      'supervision:*',
    ],
  },

  /**
   * DIGITAL - Acesso a relatórios digitais
   */
  digital: {
    allowed: [
      'reports:*',
      'contacts:read',
      'campaigns:read',
      'conversations:read',
      'profile:*',
      'productivity:read',
    ],
    denied: [
      'users:*',
      'segments:*',
      'templates:*',
      'campaigns:create',
      'campaigns:update',
      'campaigns:delete',
      'conversations:send',
      'conversations:tabulate',
      'control-panel:*',
      'tabulations:*',
      'blocklist:*',
      'system-events:*',
      'api-logs:*',
      'tags:*',
      'lines:*',
      'evolution:*',
      'supervision:*',
    ],
  },

  /**
   * AGENTE - Operador com permissões restritas
   *
   * ACESSO PERMITIDO:
   * - Atendimento completo (conversas, mensagens)
   * - Contatos (leitura e atualização)
   * - Blocklist
   * - Campanhas (envio, não criação)
   * - Relatórios básicos (apenas seus próprios dados)
   * - Perfil próprio
   *
   * ACESSO NEGADO:
   * - Supervisionar
   * - Segmentos
   * - Templates
   * - Acompanhamento/Produtividade de outros
   * - Ativadores
   * - Painel de controle
   * - Operadores online
   * - Tags
   * - Logs API
   * - Gerenciamento de usuários
   * - Gerenciamento de linhas
   */
  agente: {
    allowed: [
      // Atendimento
      'conversations:read',
      'conversations:send',
      'conversations:tabulate',
      'conversations:archive',

      // Contatos
      'contacts:read',
      'contacts:update',
      'contacts:search',

      // Blocklist
      'blocklist:read',
      'blocklist:create',

      // Relatórios (apenas básicos)
      'reports:basic',
      'reports:own', // Apenas seus próprios relatórios

      // Campanhas (envio, não gerenciamento)
      'campaigns:read',
      'campaigns:send',

      // Fila de mensagens
      'message-queue:read',

      // API de mensagens
      'api-messages:send',

      // Mídia
      'media:upload',
      'media:read',

      // Perfil próprio
      'profile:read',
      'profile:update',

      // Agentes (ver outros agentes da mesma linha)
      'agents:read-team',
    ],
    denied: [
      // Negado: Gerenciamento de usuários
      'users:*',

      // Negado: Segmentos
      'segments:*',

      // Negado: Templates
      'templates:*',

      // Negado: Linhas
      'lines:*',

      // Negado: Evolution
      'evolution:*',

      // Negado: Painel de controle
      'control-panel:*',

      // Negado: Tabulações (gerenciamento)
      'tabulations:create',
      'tabulations:update',
      'tabulations:delete',

      // Negado: Relatórios avançados
      'reports:advanced',
      'reports:all', // Não pode ver relatórios de todos

      // Negado: Produtividade de outros
      'productivity:*',

      // Negado: Supervisão
      'supervision:*',

      // Negado: Ativadores
      'ativadores:*',

      // Negado: Fila de operadores
      'operator-queue:*',

      // Negado: Eventos do sistema
      'system-events:*',

      // Negado: Tags
      'tags:*',

      // Negado: Logs de API
      'api-logs:*',

      // Negado: Ver operadores online
      'operators-online:*',

      // Negado: Gerenciamento de campanhas
      'campaigns:create',
      'campaigns:update',
      'campaigns:delete',

      // Negado: Contatos (criar/deletar)
      'contacts:create',
      'contacts:delete',

      // Negado: Blocklist (deletar)
      'blocklist:update',
      'blocklist:delete',
    ],
  },
};

/**
 * Verifica se um role tem permissão para realizar uma ação
 *
 * @param role - Role do usuário
 * @param permission - Permissão a verificar (formato: "recurso:ação")
 * @returns true se tem permissão, false caso contrário
 *
 * @example
 * hasPermission(Role.agente, 'conversations:read') // true
 * hasPermission(Role.agente, 'segments:create') // false
 * hasPermission(Role.admin, 'anything') // true
 */
export function hasPermission(role: Role, permission: string): boolean {
  const rolePerms = ROLE_PERMISSIONS[role];

  if (!rolePerms) {
    return false;
  }

  // Verifica se está explicitamente negado
  const isDenied = rolePerms.denied.some((deniedPerm) => {
    if (deniedPerm === '*') {
      return true;
    }
    if (deniedPerm.endsWith(':*')) {
      const resource = deniedPerm.replace(':*', '');
      return permission.startsWith(`${resource}:`);
    }
    return deniedPerm === permission;
  });

  if (isDenied) {
    return false;
  }

  // Verifica se está permitido
  const isAllowed = rolePerms.allowed.some((allowedPerm) => {
    if (allowedPerm === '*') {
      return true;
    }
    if (allowedPerm.endsWith(':*')) {
      const resource = allowedPerm.replace(':*', '');
      return permission.startsWith(`${resource}:`);
    }
    return allowedPerm === permission;
  });

  return isAllowed;
}

/**
 * Verifica se um role pode acessar qualquer uma das permissões fornecidas
 *
 * @param role - Role do usuário
 * @param permissions - Array de permissões a verificar
 * @returns true se tem pelo menos uma permissão, false caso contrário
 *
 * @example
 * hasAnyPermission(Role.agente, ['segments:read', 'conversations:read']) // true (tem conversations:read)
 */
export function hasAnyPermission(
  role: Role,
  permissions: string[],
): boolean {
  return permissions.some((permission) => hasPermission(role, permission));
}

/**
 * Verifica se um role pode acessar todas as permissões fornecidas
 *
 * @param role - Role do usuário
 * @param permissions - Array de permissões a verificar
 * @returns true se tem todas as permissões, false caso contrário
 *
 * @example
 * hasAllPermissions(Role.agente, ['conversations:read', 'conversations:send']) // true
 * hasAllPermissions(Role.agente, ['conversations:read', 'segments:read']) // false
 */
export function hasAllPermissions(
  role: Role,
  permissions: string[],
): boolean {
  return permissions.every((permission) => hasPermission(role, permission));
}

/**
 * Retorna todas as permissões de um role
 *
 * @param role - Role do usuário
 * @returns Objeto com permissões permitidas e negadas
 */
export function getRolePermissions(role: Role): RolePermissions {
  return ROLE_PERMISSIONS[role] || { allowed: [], denied: [] };
}

/**
 * Verifica se um role é considerado "staff" (admin ou supervisor)
 */
export function isStaffRole(role: Role): boolean {
  return role === Role.admin || role === Role.supervisor;
}

/**
 * Verifica se um role é um operador (operator ou agente)
 */
export function isOperatorRole(role: Role): boolean {
  return role === Role.operator || role === Role.agente;
}

/**
 * Verifica se o role pode acessar dados de outros usuários
 */
export function canAccessOthersData(role: Role): boolean {
  return role === Role.admin || role === Role.supervisor;
}
