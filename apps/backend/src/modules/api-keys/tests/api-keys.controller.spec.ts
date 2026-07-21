import { Test, TestingModule } from '@nestjs/testing';
import { ApiKeysController } from '../api-keys.controller';
import { ApiKeysService } from '../api-keys.service';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { Role } from '../../../common/enums/role.enum';

describe('ApiKeysController', () => {
  let controller: ApiKeysController;
  let service: jest.Mocked<ApiKeysService>;

  const currentUser: AuthenticatedUser = {
    userId: 'user-1',
    email: 'user1@example.com',
    roles: [Role.ANALYST],
  };

  beforeEach(async () => {
    const mockService: Partial<jest.Mocked<ApiKeysService>> = {
      createApiKey: jest.fn(),
      getApiKeys: jest.fn(),
      revokeApiKey: jest.fn(),
      getApiKeyUsage: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApiKeysController],
      providers: [{ provide: ApiKeysService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(ApiKeysController);
    service = module.get(ApiKeysService);
  });

  it('creates a key scoped to the authenticated user, ignoring any client-supplied id', async () => {
    await controller.createApiKey(currentUser, { name: 'CI key' });

    expect(service.createApiKey).toHaveBeenCalledWith('user-1', { name: 'CI key' });
  });

  it("lists only the authenticated user's keys", async () => {
    await controller.getApiKeys(currentUser);

    expect(service.getApiKeys).toHaveBeenCalledWith('user-1');
  });

  it('revokes a key scoped to the authenticated user', async () => {
    await controller.revokeApiKey(currentUser, 'key-1');

    expect(service.revokeApiKey).toHaveBeenCalledWith('user-1', 'key-1');
  });

  it('reads usage scoped to the authenticated user', async () => {
    await controller.getApiKeyUsage(currentUser, 'key-1');

    expect(service.getApiKeyUsage).toHaveBeenCalledWith('user-1', 'key-1');
  });
});
