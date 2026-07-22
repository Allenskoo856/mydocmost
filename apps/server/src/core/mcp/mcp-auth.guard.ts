import * as crypto from 'crypto';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { EnvironmentService } from '../../integrations/environment/environment.service';

@Injectable()
export class McpAuthGuard implements CanActivate {
  constructor(private readonly environmentService: EnvironmentService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const expectedToken = this.environmentService.getMcpApiToken();
    if (!expectedToken) {
      throw new UnauthorizedException('MCP is not enabled');
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const authHeader = request.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

    if (!token) {
      throw new UnauthorizedException('Missing MCP API token');
    }

    if (!this.timingSafeEqual(token, expectedToken)) {
      throw new UnauthorizedException('Invalid MCP API token');
    }

    const origin = request.headers.origin;
    if (origin && !this.environmentService.getMcpAllowedOrigins().includes(origin)) {
      throw new ForbiddenException('Origin is not allowed for MCP');
    }

    return true;
  }

  private timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) {
      // Perform a comparison even when lengths differ to reduce timing leakage.
      const bufA = Buffer.from(a);
      const bufB = Buffer.alloc(bufA.length, 0);
      return crypto.timingSafeEqual(bufA, bufB) && false;
    }
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }
}
