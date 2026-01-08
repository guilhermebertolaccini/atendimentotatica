import { SetMetadata } from '@nestjs/common';

/**
 * Decorator para definir permissões necessárias em um endpoint
 *
 * @param permissions - Array de permissões necessárias (formato: "recurso:ação")
 *
 * @example
 * @Get()
 * @Permissions('conversations:read')
 * async getConversations() { ... }
 *
 * @example
 * @Post()
 * @Permissions('conversations:send', 'conversations:create')
 * async sendMessage() { ... }
 */
export const Permissions = (...permissions: string[]) =>
  SetMetadata('permissions', permissions);

/**
 * Key usada para armazenar as permissões nos metadados
 */
export const PERMISSIONS_KEY = 'permissions';
