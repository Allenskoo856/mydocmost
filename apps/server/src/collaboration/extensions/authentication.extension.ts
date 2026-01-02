import { Extension, onAuthenticatePayload } from '@hocuspocus/server';
import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { TokenService } from '../../core/auth/services/token.service';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { findHighestUserSpaceRole } from '@docmost/db/repos/space/utils';
import { SpaceRole } from '../../common/helpers/types/permission';
import { getCollabDocumentInfo } from '../collaboration.util';
import { JwtCollabPayload, JwtType } from '../../core/auth/dto/jwt-payload';
import { DocDatabaseRepo } from '@docmost/db/repos/doc-database/doc-database.repo';

@Injectable()
export class AuthenticationExtension implements Extension {
  private readonly logger = new Logger(AuthenticationExtension.name);

  constructor(
    private tokenService: TokenService,
    private userRepo: UserRepo,
    private pageRepo: PageRepo,
    private docDatabaseRepo: DocDatabaseRepo,
    private readonly spaceMemberRepo: SpaceMemberRepo,
  ) {}

  async onAuthenticate(data: onAuthenticatePayload) {
    const { documentName, token } = data;
    const info = getCollabDocumentInfo(documentName);

    let jwtPayload: JwtCollabPayload;

    try {
      jwtPayload = await this.tokenService.verifyJwt(token, JwtType.COLLAB);
    } catch (error) {
      throw new UnauthorizedException('Invalid collab token');
    }

    const userId = jwtPayload.sub;
    const workspaceId = jwtPayload.workspaceId;

    const user = await this.userRepo.findById(userId, workspaceId);

    if (!user) {
      throw new UnauthorizedException();
    }

    if (user.deactivatedAt || user.deletedAt) {
      throw new UnauthorizedException();
    }

    const resource =
      info.type === 'database'
        ? await this.docDatabaseRepo.findById(info.id)
        : await this.pageRepo.findById(info.id);

    if (!resource) {
      this.logger.warn(`Collab resource not found: ${documentName}`);
      throw new NotFoundException('Resource not found');
    }

    const userSpaceRoles = await this.spaceMemberRepo.getUserSpaceRoles(
      user.id,
      resource.spaceId,
    );

    const userSpaceRole = findHighestUserSpaceRole(userSpaceRoles);

    if (!userSpaceRole) {
      this.logger.warn(`User not authorized to access: ${documentName}`);
      throw new UnauthorizedException();
    }

    if (userSpaceRole === SpaceRole.READER) {
      data.connection.readOnly = true;
      this.logger.debug(`User granted readonly access to: ${documentName}`);
    }

    this.logger.debug(`Authenticated user ${user.id} on ${documentName}`);

    return {
      user,
    };
  }
}
