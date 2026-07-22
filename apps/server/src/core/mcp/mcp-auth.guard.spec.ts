import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { McpAuthGuard } from './mcp-auth.guard';
import { EnvironmentService } from '../../integrations/environment/environment.service';

describe('McpAuthGuard', () => {
  let guard: McpAuthGuard;
  let envService: Partial<EnvironmentService>;

  beforeEach(() => {
    envService = {
      getMcpApiToken: jest
        .fn()
        .mockReturnValue('valid-token-32-chars-long-minimum'),
      getMcpAllowedOrigins: jest
        .fn()
        .mockReturnValue(['https://docs.internal']),
    };
    guard = new McpAuthGuard(envService as EnvironmentService);
  });

  it('allows a valid token without an Origin header', async () => {
    const context = createContext('Bearer valid-token-32-chars-long-minimum');
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('allows a configured Origin', async () => {
    const context = createContext(
      'Bearer valid-token-32-chars-long-minimum',
      'https://docs.internal',
    );
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('rejects an unconfigured Origin', async () => {
    const context = createContext(
      'Bearer valid-token-32-chars-long-minimum',
      'https://attacker.example',
    );
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects when MCP is not enabled', async () => {
    envService.getMcpApiToken = jest.fn().mockReturnValue(undefined);
    const context = createContext('Bearer valid-token-32-chars-long-minimum');
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a missing token', async () => {
    const context = createContext('');
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an invalid token', async () => {
    const context = createContext('Bearer wrong-token-32-chars-long-minimum');
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  function createContext(
    authHeader: string,
    origin?: string,
  ): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () =>
          ({
            headers: { authorization: authHeader, origin },
          }) as FastifyRequest,
      }),
    } as ExecutionContext;
  }
});
