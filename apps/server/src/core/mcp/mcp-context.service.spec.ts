import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { McpAgentUserService } from './mcp-agent-user.service';
import { McpContextService } from './mcp-context.service';
import { McpToolError } from './utils/mcp-error.util';

describe('McpContextService', () => {
  const workspaceRepo = {
    findById: jest.fn(),
    findAll: jest.fn(),
  } as unknown as jest.Mocked<WorkspaceRepo>;
  const agentUserService = {
    findOrCreateForWorkspace: jest.fn(),
  } as unknown as jest.Mocked<McpAgentUserService>;
  const service = new McpContextService(agentUserService, workspaceRepo);

  beforeEach(() => jest.clearAllMocks());

  it('loads an explicitly selected workspace and its agent user', async () => {
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

  it('automatically resolves the only active workspace', async () => {
    const workspace = {
      id: 'workspace-id',
      deletedAt: null,
    } as Workspace;
    const user = { id: 'user-id' } as User;
    workspaceRepo.findAll.mockResolvedValue([workspace]);
    agentUserService.findOrCreateForWorkspace.mockResolvedValue(user);

    await expect(service.load()).resolves.toEqual({ workspace, user });
  });

  it('requires workspaceId when multiple workspaces exist', async () => {
    workspaceRepo.findAll.mockResolvedValue([
      { id: 'workspace-1' } as Workspace,
      { id: 'workspace-2' } as Workspace,
    ]);

    await expect(service.load()).rejects.toMatchObject({
      code: 'WORKSPACE_AMBIGUOUS',
    } satisfies Partial<McpToolError>);
    expect(agentUserService.findOrCreateForWorkspace).not.toHaveBeenCalled();
  });

  it('rejects missing or deleted workspaces', async () => {
    workspaceRepo.findById.mockResolvedValue({
      id: 'workspace-id',
      deletedAt: new Date(),
    } as Workspace);

    await expect(service.load('workspace-id')).rejects.toMatchObject({
      code: 'WORKSPACE_NOT_FOUND',
    } satisfies Partial<McpToolError>);
    expect(agentUserService.findOrCreateForWorkspace).not.toHaveBeenCalled();
  });
});
