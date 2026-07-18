import { McpAgentUserService } from './mcp-agent-user.service';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { User } from '@docmost/db/types/entity.types';
import { Workspace } from '@docmost/db/types/entity.types';
import { UserRole } from '../../common/helpers/types/permission';

describe('McpAgentUserService', () => {
  let service: McpAgentUserService;
  let userRepo: jest.Mocked<Partial<UserRepo>>;
  let workspaceRepo: jest.Mocked<Partial<WorkspaceRepo>>;
  let envService: jest.Mocked<Partial<EnvironmentService>>;

  beforeEach(() => {
    userRepo = {
      findByEmail: jest.fn(),
      insertUser: jest.fn(),
    };

    workspaceRepo = {
      findAll: jest.fn(),
      findById: jest.fn(),
    };

    envService = {
      getMcpApiToken: jest.fn().mockReturnValue('configured-token'),
      getMcpAgentUserEmail: jest.fn().mockReturnValue('agent@docmost.local'),
    };

    service = new McpAgentUserService(
      userRepo as unknown as UserRepo,
      workspaceRepo as unknown as WorkspaceRepo,
      envService as unknown as EnvironmentService,
    );
  });

  describe('onModuleInit', () => {
    it('should skip initialization when MCP API token is not configured', async () => {
      envService.getMcpApiToken.mockReturnValue(undefined);

      await service.onModuleInit();

      expect(workspaceRepo.findAll).not.toHaveBeenCalled();
    });

    it('should ensure an agent user for every workspace', async () => {
      workspaceRepo.findAll.mockResolvedValue([
        { id: 'ws-1' } as Workspace,
        { id: 'ws-2' } as Workspace,
      ]);
      userRepo.findByEmail.mockResolvedValue({
        id: 'user-1',
        deletedAt: null,
        deactivatedAt: null,
      } as User);

      await service.onModuleInit();

      expect(workspaceRepo.findAll).toHaveBeenCalledTimes(1);
      expect(userRepo.findByEmail).toHaveBeenCalledTimes(2);
      expect(userRepo.findByEmail).toHaveBeenNthCalledWith(
        1,
        'agent@docmost.local',
        'ws-1',
      );
      expect(userRepo.findByEmail).toHaveBeenNthCalledWith(
        2,
        'agent@docmost.local',
        'ws-2',
      );
    });
  });

  describe('findOrCreateForWorkspace', () => {
    it('should return an existing active agent user', async () => {
      const existingUser = {
        id: 'user-1',
        deletedAt: null,
        deactivatedAt: null,
      } as User;
      userRepo.findByEmail.mockResolvedValue(existingUser);

      const result = await service.findOrCreateForWorkspace('ws-1');

      expect(result).toBe(existingUser);
      expect(userRepo.findByEmail).toHaveBeenCalledWith(
        'agent@docmost.local',
        'ws-1',
      );
      expect(userRepo.insertUser).not.toHaveBeenCalled();
    });

    it('should throw when the agent user is disabled', async () => {
      userRepo.findByEmail.mockResolvedValue({
        id: 'user-1',
        deletedAt: new Date(),
        deactivatedAt: null,
      } as User);

      await expect(service.findOrCreateForWorkspace('ws-1')).rejects.toThrow(
        'MCP agent user is disabled in workspace ws-1',
      );
    });

    it('should create a new agent user when none exists', async () => {
      userRepo.findByEmail.mockResolvedValue(undefined);
      workspaceRepo.findById.mockResolvedValue({ id: 'ws-1' } as Workspace);

      const createdUser = { id: 'user-2' } as User;
      userRepo.insertUser.mockResolvedValue(createdUser);

      const result = await service.findOrCreateForWorkspace('ws-1');

      expect(result).toBe(createdUser);
      expect(workspaceRepo.findById).toHaveBeenCalledWith('ws-1');
      expect(userRepo.insertUser).toHaveBeenCalledTimes(1);

      const insertArgs = userRepo.insertUser.mock.calls[0][0];
      expect(insertArgs.name).toBe('Docmost Agent');
      expect(insertArgs.email).toBe('agent@docmost.local');
      expect(insertArgs.role).toBe(UserRole.ADMIN);
      expect(insertArgs.workspaceId).toBe('ws-1');
      expect(insertArgs.password).toBeDefined();
      expect(insertArgs.password).not.toBe('');
    });

    it('should throw when the workspace does not exist', async () => {
      userRepo.findByEmail.mockResolvedValue(undefined);
      workspaceRepo.findById.mockResolvedValue(undefined);

      await expect(service.findOrCreateForWorkspace('ws-1')).rejects.toThrow(
        'Workspace ws-1 not found',
      );
      expect(userRepo.insertUser).not.toHaveBeenCalled();
    });
  });
});
