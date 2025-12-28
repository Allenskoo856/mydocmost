// EE功能已禁用 - Stub实现
export interface IApiKey {
  id: string;
  name: string;
}

export async function getApiKeys(params?: any) {
  return [];
}

export function useGetApiKeysQuery() {
  return {
    data: [],
    isLoading: false,
  };
}

export function useCreateApiKeyMutation() {
  return {
    mutate: () => {},
    isPending: false,
  };
}

export function useUpdateApiKeyMutation() {
  return {
    mutate: () => {},
    isPending: false,
  };
}

export function useRevokeApiKeyMutation() {
  return {
    mutate: () => {},
    isPending: false,
  };
}
