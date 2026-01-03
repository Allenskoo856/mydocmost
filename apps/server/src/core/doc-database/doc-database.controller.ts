import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import {
  CreateDocDatabaseDto,
  CreateDocDatabaseViewDto,
  DocDatabaseInfoDto,
  SetDefaultDocDatabaseViewDto,
  UpdateDocDatabaseDto,
} from './dto/doc-database.dto';
import { DocDatabaseService } from './services/doc-database.service';
import { SpaceRole } from '../../common/helpers/types/permission';

@UseGuards(JwtAuthGuard)
@Controller('doc-databases')
export class DocDatabaseController {
  constructor(private readonly docDatabaseService: DocDatabaseService) {}

  @HttpCode(HttpStatus.OK)
  @Post('create')
  async create(
    @Body() dto: CreateDocDatabaseDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.docDatabaseService.createDatabase(
      user,
      workspace.id,
      dto.spaceId,
      dto.title,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('info')
  async info(@Body() dto: DocDatabaseInfoDto, @AuthUser() user: User) {
    return this.docDatabaseService.getInfo(user, dto.databaseId);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  async update(
    @Body() dto: UpdateDocDatabaseDto,
    @AuthUser() user: User,
  ) {
    return this.docDatabaseService.updateDatabase(user, dto.databaseId, {
      title: dto.title,
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('views/create')
  async createView(
    @Body() dto: CreateDocDatabaseViewDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.docDatabaseService.createView(user, workspace.id, dto.databaseId, {
      name: dto.name,
      type: dto.type,
      config: dto.config,
      isDefault: dto.isDefault,
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('views/set-default')
  async setDefaultView(
    @Body() dto: SetDefaultDocDatabaseViewDto,
    @AuthUser() user: User,
  ) {
    return this.docDatabaseService.setDefaultView(user, dto.databaseId, dto.viewId);
  }
}
