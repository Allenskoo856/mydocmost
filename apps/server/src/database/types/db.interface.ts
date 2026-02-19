import {
  ApiKeys,
  Attachments,
  AuthAccounts,
  AuthProviders,
  Backlinks,
  Billing,
  Comments,
  FileTasks,
  Groups,
  GroupUsers,
  PageHistory,
  Pages,
  Shares,
  SpaceMembers,
  SpacePagePropertyConfigs,
  Spaces,
  Templates,
  TemplateUsages,
  UserMfa,
  Users,
  UserTokens,
  WorkspaceInvitations,
  Workspaces,
} from '@docmost/db/types/db';
import { PageEmbeddings } from '@docmost/db/types/embeddings.types';

export interface DbInterface {
  attachments: Attachments;
  authAccounts: AuthAccounts;
  authProviders: AuthProviders;
  backlinks: Backlinks;
  billing: Billing;
  comments: Comments;
  fileTasks: FileTasks;
  groups: Groups;
  groupUsers: GroupUsers;
  pageEmbeddings: PageEmbeddings;
  pageHistory: PageHistory;
  pages: Pages;
  shares: Shares;
  spaceMembers: SpaceMembers;
  spacePagePropertyConfigs: SpacePagePropertyConfigs;
  spaces: Spaces;
  templates: Templates;
  templateUsages: TemplateUsages;
  userMfa: UserMfa;
  users: Users;
  userTokens: UserTokens;
  workspaceInvitations: WorkspaceInvitations;
  workspaces: Workspaces;
  apiKeys: ApiKeys;
}
