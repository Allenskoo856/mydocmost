import { Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AuthenticationExtension } from './extensions/authentication.extension';
import { PersistenceExtension } from './extensions/persistence.extension';
import { CollaborationGateway } from './collaboration.gateway';
import { HttpAdapterHost } from '@nestjs/core';
import { CollabWsAdapter } from './adapter/collab-ws.adapter';
import { IncomingMessage } from 'http';
import { WebSocket } from 'ws';
import { TokenModule } from '../core/auth/token.module';
import { HistoryListener } from './listeners/history.listener';
import { LoggerExtension } from './extensions/logger.extension';
import { EnvironmentService } from '../integrations/environment/environment.service';

@Module({
  providers: [
    CollaborationGateway,
    AuthenticationExtension,
    PersistenceExtension,
    LoggerExtension,
    HistoryListener,
  ],
  exports: [CollaborationGateway],
  imports: [TokenModule],
})
export class CollaborationModule implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CollaborationModule.name);
  private collabWsAdapter: CollabWsAdapter;

  constructor(
    private readonly collaborationGateway: CollaborationGateway,
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly environmentService: EnvironmentService,
  ) {}

  onModuleInit() {
    this.collabWsAdapter = new CollabWsAdapter();
    const httpServer = this.httpAdapterHost.httpAdapter.getHttpServer();

    const basePath = this.environmentService.getBasePath();
    const collabPath = basePath ? `${basePath}/collab` : '/collab';

    const wss = this.collabWsAdapter.handleUpgrade(collabPath, httpServer);

    wss.on('connection', (client: WebSocket, request: IncomingMessage) => {
      this.collaborationGateway.handleConnection(client, request);

      client.on('error', (error) => {
        this.logger.error('WebSocket client error:', error);
      });
    });

    wss.on('error', (error) =>
      this.logger.log('WebSocket server error:', error),
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.collaborationGateway) {
      await this.collaborationGateway.destroy();
    }
    if (this.collabWsAdapter) {
      this.collabWsAdapter.destroy();
    }
  }
}
