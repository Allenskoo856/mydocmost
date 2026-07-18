import * as crypto from 'crypto';
import {
  CanActivate,
  ExecutionContext,
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

    return true;
  }

  private timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) {
      // 为避免直接返回，继续做一次比较以模糊长度差异
      // 实际生产仍建议固定长度 token
      const bufA = Buffer.from(a);
      const bufB = Buffer.alloc(bufA.length, 0);
      return crypto.timingSafeEqual(bufA, bufB) && false;
    }
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }
}
