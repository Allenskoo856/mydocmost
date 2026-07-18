import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { User } from '@docmost/db/types/entity.types';
import { UserRole } from '../../common/helpers/types/permission';
import { v7 as uuid7 } from 'uuid';

@Injectable()
export class McpAgentUserService implements OnModuleInit {
  private readonly logger = new Logger(McpAgentUserService.name);

  constructor(
    private readonly userRepo: UserRepo,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly environmentService: EnvironmentService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.environmentService.getMcpApiToken()) {
      this.logger.log('MCP is not enabled, skip agent user initialization');
      return;
    }

    const workspaces = await this.workspaceRepo.findAll();
    for (const workspace of workspaces) {
      try {
        await this.findOrCreateForWorkspace(workspace.id);
        this.logger.log(`MCP agent user ensured for workspace ${workspace.id}`);
      } catch (err) {
        this.logger.error(
          `Failed to ensure MCP agent user for workspace ${workspace.id}`,
          err,
        );
      }
    }
  }

  async findOrCreateForWorkspace(workspaceId: string): Promise<User> {
    const email = this.environmentService.getMcpAgentUserEmail();
    const existing = await this.userRepo.findByEmail(email, workspaceId);

    if (existing && !existing.deletedAt && !existing.deactivatedAt) {
      return existing;
    }

    if (existing && (existing.deletedAt || existing.deactivatedAt)) {
      throw new Error(`MCP agent user is disabled in workspace ${workspaceId}`);
    }

    const workspace = await this.workspaceRepo.findById(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    return this.userRepo.insertUser({
      id: uuid7(),
      name: 'Docmost Agent',
      email,
      role: UserRole.ADMIN,
      workspaceId,
      password: uuid7(), // random, prevents normal login
    });
  }
}
