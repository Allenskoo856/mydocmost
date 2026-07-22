import { Injectable } from '@nestjs/common';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { McpAgentUserService } from './mcp-agent-user.service';
import { McpToolError } from './utils/mcp-error.util';

export interface McpWorkspaceContext {
  user: User;
  workspace: Workspace;
}

@Injectable()
export class McpContextService {
  constructor(
    private readonly agentUserService: McpAgentUserService,
    private readonly workspaceRepo: WorkspaceRepo,
  ) {}

  async load(workspaceId?: string): Promise<McpWorkspaceContext> {
    const workspace = await this.resolveWorkspace(workspaceId);
    const user =
      await this.agentUserService.findOrCreateForWorkspace(workspace.id);
    return { user, workspace };
  }

  async resolveWorkspace(workspaceId?: string): Promise<Workspace> {
    if (workspaceId) {
      const workspace = await this.workspaceRepo.findById(workspaceId);
      if (!workspace || workspace.deletedAt) {
        throw new McpToolError('WORKSPACE_NOT_FOUND', 'Workspace not found');
      }
      return workspace;
    }

    const workspaces = await this.workspaceRepo.findAll();
    if (workspaces.length === 0) {
      throw new McpToolError('WORKSPACE_NOT_FOUND', 'Workspace not found');
    }
    if (workspaces.length > 1) {
      throw new McpToolError(
        'WORKSPACE_AMBIGUOUS',
        'Multiple workspaces found; provide workspaceId',
      );
    }
    return workspaces[0];
  }

  async listWorkspaces(): Promise<Workspace[]> {
    return this.workspaceRepo.findAll();
  }
}
