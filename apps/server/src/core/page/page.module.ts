import { Module } from '@nestjs/common';
import { PageService } from './services/page.service';
import { PageController } from './page.controller';
import { PageHistoryService } from './services/page-history.service';
import { TrashCleanupService } from './services/trash-cleanup.service';
import { StorageModule } from '../../integrations/storage/storage.module';
import { PageSnapshotService } from './services/page-snapshot.service';

@Module({
  controllers: [PageController],
  providers: [
    PageService,
    PageHistoryService,
    PageSnapshotService,
    TrashCleanupService,
  ],
  exports: [PageService, PageHistoryService],
  imports: [StorageModule],
})
export class PageModule {}
