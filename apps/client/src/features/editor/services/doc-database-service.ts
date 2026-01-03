import api from "@/lib/api-client";

export interface DocDatabaseDto {
  id: string;
  title: string | null;
  schema: any;
  spaceId: string;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocDatabaseViewDto {
  id: string;
  name: string;
  type: "table";
  config: any;
  isDefault: boolean;
  databaseId: string;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDocDatabaseRequest {
  spaceId: string;
  title?: string;
}

export interface CreateDocDatabaseResponse {
  data: {
    database: DocDatabaseDto;
    view: DocDatabaseViewDto;
  };
  success: boolean;
  status: number;
}

export interface GetDocDatabaseInfoRequest {
  databaseId: string;
}

export interface UpdateDocDatabaseRequest {
  databaseId: string;
  title?: string;
}

export interface DocDatabaseInfoResponse {
  data: {
    database: DocDatabaseDto;
    views: DocDatabaseViewDto[];
  };
  success: boolean;
  status: number;
}

export async function createDocDatabase(
  dto: CreateDocDatabaseRequest,
): Promise<CreateDocDatabaseResponse> {
  const req = await api.post<CreateDocDatabaseResponse>("/doc-databases/create", dto);
  return req as unknown as CreateDocDatabaseResponse;
}

export async function getDocDatabaseInfo(
  dto: GetDocDatabaseInfoRequest,
): Promise<DocDatabaseInfoResponse> {
  const req = await api.post<DocDatabaseInfoResponse>("/doc-databases/info", dto);
  return req as unknown as DocDatabaseInfoResponse;
}

export async function updateDocDatabase(
  dto: UpdateDocDatabaseRequest,
): Promise<DocDatabaseDto> {
  const req = await api.post<DocDatabaseDto>("/doc-databases/update", dto);
  return req as unknown as DocDatabaseDto;
}
