import { NotFoundException } from '@nestjs/common';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { McpAgentUserService } from './mcp-agent-user.service';
import { McpContextService } from './mcp-context.service';

describe('McpContextService', () => {
  const workspaceRepo = {
    findById: jest.fn(),
  } as unknown as jest.Mocked<WorkspaceRepo>;
  const agentUserService = {
    findOrCreateForWorkspace: jest.fn(),
  } as unknown as jest.Mocked<McpAgentUserService>;
  const service = new McpContextService(agentUserService, workspaceRepo);

  beforeEach(() => jest.clearAllMocks());

  it('loads the workspace and its agent user', async () => {
    const workspace = {
      id: 'workspace-id',
      deletedAt: null,
    } as Workspace;
    const user = { id: 'user-id' } as User;
    workspaceRepo.findById.mockResolvedValue(workspace);
    agentUserService.findOrCreateForWorkspace.mockResolvedValue(user);

    await expect(service.load(workspace.id)).resolves.toEqual({
      workspace,
      user,
    });
  });

  it('rejects missing or deleted workspaces', async () => {
    workspaceRepo.findById.mockResolvedValue({
      id: 'workspace-id',
      deletedAt: new Date(),
    } as Workspace);

    await expect(service.load('workspace-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(agentUserService.findOrCreateForWorkspace).not.toHaveBeenCalled();
  });
});
