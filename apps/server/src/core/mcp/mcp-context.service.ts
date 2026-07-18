import { Injectable, NotFoundException } from '@nestjs/common';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { McpAgentUserService } from './mcp-agent-user.service';

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

  async load(workspaceId: string): Promise<McpWorkspaceContext> {
    const workspace = await this.workspaceRepo.findById(workspaceId);
    if (!workspace || workspace.deletedAt) {
      throw new NotFoundException('Workspace not found');
    }

    const user =
      await this.agentUserService.findOrCreateForWorkspace(workspaceId);
    return { user, workspace };
  }
}
