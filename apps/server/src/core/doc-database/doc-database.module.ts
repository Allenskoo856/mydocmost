import { Module } from '@nestjs/common';
import { DocDatabaseController } from './doc-database.controller';
import { DocDatabaseService } from './services/doc-database.service';

@Module({
  controllers: [DocDatabaseController],
  providers: [DocDatabaseService],
})
export class DocDatabaseModule {}
