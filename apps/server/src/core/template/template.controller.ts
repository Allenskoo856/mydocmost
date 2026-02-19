import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TemplateService } from './services/template.service';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import { TemplateHomeDto } from './dto/template-home.dto';
import {
  TemplateManageListDto,
  TemplateSearchDto,
} from './dto/template-search.dto';
import { TemplateIdDto } from './dto/template-id.dto';
import { CreateTemplateFromPageDto } from './dto/template-create-from-page.dto';
import { OverwriteTemplateFromPageDto } from './dto/template-overwrite-from-page.dto';
import { UpdateTemplateMetadataDto } from './dto/template-update-metadata.dto';
import { ApplyTemplateDto } from './dto/template-apply.dto';
import { TemplateRepo } from '@docmost/db/repos/template/template.repo';
import { PageRepo } from '@docmost/db/repos/page/page.repo';

@UseGuards(JwtAuthGuard)
@Controller('templates')
export class TemplateController {
  constructor(
    private readonly templateService: TemplateService,
    private readonly templateRepo: TemplateRepo,
    private readonly pageRepo: PageRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
  ) {}

  private async assertSpaceReadable(user: User, spaceId: string) {
    const ability = await this.spaceAbility.createForUser(user, spaceId);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }
  }

  private async canManageSpaceSettings(user: User, spaceId: string) {
    const ability = await this.spaceAbility.createForUser(user, spaceId);
    return ability.can(SpaceCaslAction.Manage, SpaceCaslSubject.Settings);
  }

  private async assertPageManageable(user: User, pageId: string) {
    const page = await this.pageRepo.findById(pageId);
    if (!page) {
      throw new NotFoundException('Page not found');
    }

    const ability = await this.spaceAbility.createForUser(user, page.spaceId);
    if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    return page;
  }

  @HttpCode(HttpStatus.OK)
  @Post('home')
  async home(@Body() dto: TemplateHomeDto, @AuthUser() user: User) {
    await this.assertSpaceReadable(user, dto.spaceId);
    const isSpaceAdmin = await this.canManageSpaceSettings(user, dto.spaceId);
    return this.templateService.getHome(user, dto, isSpaceAdmin);
  }

  @HttpCode(HttpStatus.OK)
  @Post('search')
  async search(@Body() dto: TemplateSearchDto, @AuthUser() user: User) {
    await this.assertSpaceReadable(user, dto.spaceId);
    return this.templateService.search(dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('manage/list')
  async manageList(@Body() dto: TemplateManageListDto, @AuthUser() user: User) {
    await this.assertSpaceReadable(user, dto.spaceId);
    const isSpaceAdmin = await this.canManageSpaceSettings(user, dto.spaceId);
    return this.templateService.getManageList(user, dto, isSpaceAdmin);
  }

  @HttpCode(HttpStatus.OK)
  @Post('detail')
  async detail(
    @Body() dto: TemplateIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const template = await this.templateRepo.findById(dto.templateId);
    if (!template || template.workspaceId !== workspace.id) {
      throw new NotFoundException('Template not found');
    }

    await this.assertSpaceReadable(user, template.spaceId);
    const isSpaceAdmin = await this.canManageSpaceSettings(user, template.spaceId);
    return this.templateService.getDetail(user, workspace.id, dto, isSpaceAdmin);
  }

  @HttpCode(HttpStatus.OK)
  @Post('create-from-page')
  async createFromPage(
    @Body() dto: CreateTemplateFromPageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertPageManageable(user, dto.pageId);
    return this.templateService.createFromPage(user, workspace.id, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update-metadata')
  async updateMetadata(
    @Body() dto: UpdateTemplateMetadataDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const template = await this.templateRepo.findById(dto.templateId);
    if (!template || template.workspaceId !== workspace.id) {
      throw new NotFoundException('Template not found');
    }

    await this.assertSpaceReadable(user, template.spaceId);
    const isSpaceAdmin = await this.canManageSpaceSettings(user, template.spaceId);
    return this.templateService.updateMetadata(
      user,
      workspace.id,
      dto,
      isSpaceAdmin,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('overwrite-from-page')
  async overwriteFromPage(
    @Body() dto: OverwriteTemplateFromPageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertPageManageable(user, dto.pageId);

    const template = await this.templateRepo.findById(dto.templateId);
    if (!template || template.workspaceId !== workspace.id) {
      throw new NotFoundException('Template not found');
    }

    const isSpaceAdmin = await this.canManageSpaceSettings(user, template.spaceId);
    return this.templateService.overwriteFromPage(
      user,
      workspace.id,
      dto,
      isSpaceAdmin,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('publish')
  async publish(
    @Body() dto: TemplateIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const template = await this.templateRepo.findById(dto.templateId);
    if (!template || template.workspaceId !== workspace.id) {
      throw new NotFoundException('Template not found');
    }

    const isSpaceAdmin = await this.canManageSpaceSettings(user, template.spaceId);
    return this.templateService.publish(user, workspace.id, dto, isSpaceAdmin);
  }

  @HttpCode(HttpStatus.OK)
  @Post('unpublish')
  async unpublish(
    @Body() dto: TemplateIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const template = await this.templateRepo.findById(dto.templateId);
    if (!template || template.workspaceId !== workspace.id) {
      throw new NotFoundException('Template not found');
    }

    const isSpaceAdmin = await this.canManageSpaceSettings(user, template.spaceId);
    return this.templateService.unpublish(user, workspace.id, dto, isSpaceAdmin);
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  async softDelete(
    @Body() dto: TemplateIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const template = await this.templateRepo.findById(dto.templateId);
    if (!template || template.workspaceId !== workspace.id) {
      throw new NotFoundException('Template not found');
    }

    const isSpaceAdmin = await this.canManageSpaceSettings(user, template.spaceId);
    return this.templateService.softDelete(user, workspace.id, dto, isSpaceAdmin);
  }

  @HttpCode(HttpStatus.OK)
  @Post('apply')
  async apply(
    @Body() dto: ApplyTemplateDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = await this.spaceAbility.createForUser(user, dto.spaceId);
    if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    return this.templateService.applyTemplate(user, workspace.id, dto);
  }
}
