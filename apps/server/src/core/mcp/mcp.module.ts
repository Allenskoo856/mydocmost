import { Module } from '@nestjs/common';
import { ExportModule } from '../../integrations/export/export.module';
import { CollaborationModule } from '../../collaboration/collaboration.module';
import { PageModule } from '../page/page.module';
import { SpaceModule } from '../space/space.module';
import { McpAgentUserService } from './mcp-agent-user.service';
import { McpAuthGuard } from './mcp-auth.guard';
import { McpContextService } from './mcp-context.service';
import { McpController } from './mcp.controller';
import { McpServerService } from './mcp-server.service';
import { McpSessionStateService } from './mcp-session-state.service';
import { McpToolsService } from './mcp-tools.service';

@Module({
  imports: [PageModule, SpaceModule, ExportModule, CollaborationModule],
  controllers: [McpController],
  providers: [
    McpServerService,
    McpAuthGuard,
    McpAgentUserService,
    McpContextService,
    McpSessionStateService,
    McpToolsService,
  ],
})
export class McpModule {}
