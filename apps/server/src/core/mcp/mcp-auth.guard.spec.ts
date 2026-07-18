import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
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
    };
    guard = new McpAuthGuard(envService as EnvironmentService);
  });

  it('should allow request with valid token', async () => {
    const context = createContext('Bearer valid-token-32-chars-long-minimum');
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('should reject when MCP is not enabled', async () => {
    envService.getMcpApiToken = jest.fn().mockReturnValue(undefined);
    const context = createContext('Bearer valid-token-32-chars-long-minimum');
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should reject missing token', async () => {
    const context = createContext('');
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should reject invalid token', async () => {
    const context = createContext('Bearer wrong-token-32-chars-long-minimum');
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  function createContext(authHeader: string): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () =>
          ({ headers: { authorization: authHeader } }) as FastifyRequest,
      }),
    } as ExecutionContext;
  }
});
