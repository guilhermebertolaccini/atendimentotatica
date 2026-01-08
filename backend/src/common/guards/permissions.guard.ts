import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import {
  hasPermission,
  hasAllPermissions,
} from '../configs/role-permissions.config';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

/**
 * Guard que valida se o usuário tem as permissões necessárias para acessar um endpoint
 *
 * Funciona em conjunto com o decorator @Permissions()
 *
 * @example
 * @UseGuards(JwtAuthGuard, PermissionsGuard)
 * @Permissions('conversations:read')
 * async getConversations() { ... }
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Busca as permissões requeridas do endpoint
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Se não há permissões definidas, permite acesso
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Se não há usuário autenticado, nega acesso
    if (!user || !user.role) {
      this.logger.warn(
        `Acesso negado: Usuário não autenticado tentou acessar ${request.url}`,
      );
      throw new ForbiddenException(
        'Você precisa estar autenticado para acessar este recurso',
      );
    }

    const userRole: Role = user.role;

    // Admin sempre tem acesso
    if (userRole === Role.admin) {
      return true;
    }

    // Verifica se o usuário tem todas as permissões necessárias
    const hasAccess = hasAllPermissions(userRole, requiredPermissions);

    if (!hasAccess) {
      this.logger.warn(
        `Acesso negado: Usuário ${user.email} (role: ${userRole}) tentou acessar ${request.url} sem permissões ${requiredPermissions.join(', ')}`,
      );

      throw new ForbiddenException(
        'Você não tem permissão para acessar este recurso',
      );
    }

    // Log de sucesso (apenas em modo debug)
    if (process.env.LOG_PERMISSIONS === 'true') {
      this.logger.debug(
        `Acesso permitido: Usuário ${user.email} (role: ${userRole}) acessou ${request.url}`,
      );
    }

    return true;
  }
}
