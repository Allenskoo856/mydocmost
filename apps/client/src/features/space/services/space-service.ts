import api from "@/lib/api-client";
import {
  IAddSpaceMember,
  IChangeSpaceMemberRole,
  IExportSpaceParams,
  IRemoveSpaceMember,
  ISpacePagePropertyStatusConfig,
  ISpace,
  ISpaceMember,
} from "@/features/space/types/space.types";
import { IPagination, QueryParams } from "@/lib/types.ts";
import { saveAs } from "file-saver";
import { logRequestPerf, markPerf, measurePerf } from "@/lib/perf.ts";

export async function getSpaces(
  params?: QueryParams,
): Promise<IPagination<ISpace>> {
  const req = await api.post("/spaces", params);
  return req.data;
}

export async function getSpaceById(spaceId: string): Promise<ISpace> {
  const startMark = `spaces.info:${spaceId}:start`;
  const endMark = `spaces.info:${spaceId}:end`;

  markPerf(startMark, { spaceId });
  logRequestPerf("spaces.info", "start", { spaceId });
  const req = await api.post<ISpace>("/spaces/info", { spaceId });
  markPerf(endMark, { spaceId });
  measurePerf("spaces.info", startMark, endMark, { spaceId });
  logRequestPerf("spaces.info", "end", { spaceId });
  return req.data;
}

export async function createSpace(data: Partial<ISpace>): Promise<ISpace> {
  const req = await api.post<ISpace>("/spaces/create", data);
  return req.data;
}

export async function updateSpace(data: Partial<ISpace>): Promise<ISpace> {
  const req = await api.post<ISpace>("/spaces/update", data);
  return req.data;
}

export async function deleteSpace(spaceId: string): Promise<void> {
  await api.post<void>("/spaces/delete", { spaceId });
}

export async function getSpaceMembers(
  spaceId: string,
  params?: QueryParams,
): Promise<IPagination<ISpaceMember>> {
  const req = await api.post<any>("/spaces/members", { spaceId, ...params });
  return req.data;
}

export async function addSpaceMember(data: IAddSpaceMember): Promise<void> {
  await api.post("/spaces/members/add", data);
}

export async function removeSpaceMember(
  data: IRemoveSpaceMember,
): Promise<void> {
  await api.post("/spaces/members/remove", data);
}

export async function changeMemberRole(
  data: IChangeSpaceMemberRole,
): Promise<void> {
  await api.post("/spaces/members/change-role", data);
}

export async function exportSpace(data: IExportSpaceParams): Promise<void> {
  const req = await api.post("/spaces/export", data, {
    responseType: "blob",
  });

  const fileName = req?.headers["content-disposition"]
    .split("filename=")[1]
    .replace(/"/g, "");

  saveAs(req.data, decodeURIComponent(fileName));
}

export async function getSpacePagePropertyStatusConfig(
  spaceId: string,
): Promise<ISpacePagePropertyStatusConfig> {
  const req = await api.post<ISpacePagePropertyStatusConfig>(
    "/spaces/page-properties/status-config/get",
    { spaceId },
  );
  return req.data;
}

export async function updateSpacePagePropertyStatusConfig(
  spaceId: string,
  statusOptions: string[],
): Promise<ISpacePagePropertyStatusConfig> {
  const req = await api.post<ISpacePagePropertyStatusConfig>(
    "/spaces/page-properties/status-config/update",
    { spaceId, statusOptions },
  );
  return req.data;
}
