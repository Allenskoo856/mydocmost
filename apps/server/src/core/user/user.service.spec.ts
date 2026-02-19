import { UserService } from './user.service';
import { UserRepo } from '@docmost/db/repos/user/user.repo';

describe('UserService', () => {
  const workspace = { id: 'workspace-1' } as any;
  const baseUser = { id: 'user-1', email: 'user@example.com' } as any;

  let userRepo: jest.Mocked<
    Pick<UserRepo, 'findById' | 'updatePreference' | 'updateUser' | 'findByEmail'>
  >;
  let service: UserService;

  beforeEach(() => {
    userRepo = {
      findById: jest.fn().mockResolvedValue(baseUser),
      updatePreference: jest.fn().mockResolvedValue(baseUser),
      updateUser: jest.fn(),
      findByEmail: jest.fn(),
    };
    service = new UserService(userRepo as unknown as UserRepo);
  });

  it('should update tocDefaultOpen preference to true', async () => {
    await service.update(
      { tocDefaultOpen: true } as any,
      'user-1',
      workspace,
    );

    expect(userRepo.updatePreference).toHaveBeenCalledWith(
      'user-1',
      'tocDefaultOpen',
      true,
    );
  });

  it('should update tocDefaultOpen preference to false', async () => {
    await service.update(
      { tocDefaultOpen: false } as any,
      'user-1',
      workspace,
    );

    expect(userRepo.updatePreference).toHaveBeenCalledWith(
      'user-1',
      'tocDefaultOpen',
      false,
    );
  });
});
