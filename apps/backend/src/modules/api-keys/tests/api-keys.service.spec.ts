import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../database/prisma.service';
import { ApiKeysService } from '../api-keys.service';

describe('ApiKeysService', () => {
  let service: ApiKeysService;

  const mockPrisma = {
    apiKey: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [ApiKeysService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get(ApiKeysService);
  });

  describe('createApiKey', () => {
    it('generates a unique, sk_-prefixed key and stores only its hash', async () => {
      mockPrisma.apiKey.create.mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'key-1',
          name: data.name,
          keyHash: data.keyHash,
          createdAt: new Date('2026-01-01'),
          lastUsedAt: null,
          revokedAt: null,
        }),
      );

      const result = await service.createApiKey('user-1', { name: 'CI key' });

      expect(result.key).toMatch(/^sk_[0-9a-f]{64}$/);
      expect(mockPrisma.apiKey.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          name: 'CI key',
        }),
      });

      const createCall = mockPrisma.apiKey.create.mock.calls[0][0];
      expect(createCall.data.key).not.toBe(result.key);
      expect(createCall.data.keyHash).not.toBe(result.key);
      expect(result.keyPreview).toBe(result.key.slice(-4));
    });

    it('produces a different key on every call', async () => {
      mockPrisma.apiKey.create.mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'key-x',
          name: data.name,
          keyHash: data.keyHash,
          createdAt: new Date(),
          lastUsedAt: null,
          revokedAt: null,
        }),
      );

      const a = await service.createApiKey('user-1', { name: 'a' });
      const b = await service.createApiKey('user-1', { name: 'b' });

      expect(a.key).not.toBe(b.key);
    });
  });

  describe('getApiKeys', () => {
    it("only returns the given user's non-revoked keys, without the raw key", async () => {
      mockPrisma.apiKey.findMany.mockResolvedValue([
        {
          id: 'key-1',
          name: 'k1',
          keyHash: 'a'.repeat(60) + 'beef',
          createdAt: new Date(),
          lastUsedAt: null,
          revokedAt: null,
        },
      ]);

      const result = await service.getApiKeys('user-1');

      expect(mockPrisma.apiKey.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      expect(result[0]).not.toHaveProperty('key');
      expect(result[0].keyPreview).toBe('beef');
    });
  });

  describe('revokeApiKey', () => {
    it('revokes a key owned by the caller', async () => {
      mockPrisma.apiKey.findFirst.mockResolvedValue({
        id: 'key-1',
        userId: 'user-1',
        revokedAt: null,
      });

      await service.revokeApiKey('user-1', 'key-1');

      expect(mockPrisma.apiKey.findFirst).toHaveBeenCalledWith({
        where: { id: 'key-1', userId: 'user-1' },
      });
      expect(mockPrisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: 'key-1' },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('throws NotFoundException for a key owned by another user, without leaking existence', async () => {
      // Ownership is enforced in the WHERE clause, so a key that exists but
      // belongs to someone else is indistinguishable from a missing key.
      mockPrisma.apiKey.findFirst.mockResolvedValue(null);

      await expect(service.revokeApiKey('user-1', 'someone-elses-key')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.apiKey.update).not.toHaveBeenCalled();
    });

    it('is idempotent for an already-revoked key', async () => {
      mockPrisma.apiKey.findFirst.mockResolvedValue({
        id: 'key-1',
        userId: 'user-1',
        revokedAt: new Date('2026-01-01'),
      });

      await service.revokeApiKey('user-1', 'key-1');

      expect(mockPrisma.apiKey.update).not.toHaveBeenCalled();
    });
  });

  describe('validateAndUpdateUsage', () => {
    it('returns the owning userId and bumps lastUsedAt for a valid key', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValue({
        id: 'key-1',
        userId: 'user-1',
        revokedAt: null,
      });

      const userId = await service.validateAndUpdateUsage('sk_raw-key-value');

      expect(userId).toBe('user-1');
      expect(mockPrisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: 'key-1' },
        data: { lastUsedAt: expect.any(Date) },
      });
    });

    it('returns null for an unknown key', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValue(null);

      const userId = await service.validateAndUpdateUsage('sk_unknown');

      expect(userId).toBeNull();
      expect(mockPrisma.apiKey.update).not.toHaveBeenCalled();
    });

    it('returns null for a revoked key', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValue({
        id: 'key-1',
        userId: 'user-1',
        revokedAt: new Date(),
      });

      const userId = await service.validateAndUpdateUsage('sk_revoked');

      expect(userId).toBeNull();
      expect(mockPrisma.apiKey.update).not.toHaveBeenCalled();
    });
  });

  describe('getApiKeyUsage', () => {
    it('throws NotFoundException when the key belongs to another user', async () => {
      mockPrisma.apiKey.findFirst.mockResolvedValue(null);

      await expect(service.getApiKeyUsage('user-1', 'key-owned-by-user-2')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns usage metadata for a key the caller owns', async () => {
      mockPrisma.apiKey.findFirst.mockResolvedValue({
        id: 'key-1',
        userId: 'user-1',
        name: 'k1',
        keyHash: 'a'.repeat(60) + 'beef',
        createdAt: new Date(),
        lastUsedAt: null,
      });

      const result = await service.getApiKeyUsage('user-1', 'key-1');

      expect(mockPrisma.apiKey.findFirst).toHaveBeenCalledWith({
        where: { id: 'key-1', userId: 'user-1' },
      });
      expect(result.keyPreview).toBe('beef');
    });
  });
});
