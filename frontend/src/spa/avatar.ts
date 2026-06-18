import type { ApiClient } from "./api";

type AvatarUser = {
  avatarFileId?: unknown;
  avatarUrl?: unknown;
} | null | undefined;

export function avatarImageUrl(user: AvatarUser, api: Pick<ApiClient, "files">) {
  const fileId = optionalText(user?.avatarFileId) || fileIdFromApiFileUrl(user?.avatarUrl);
  if (fileId) return api.files.url(fileId);
  return optionalText(user?.avatarUrl);
}

function fileIdFromApiFileUrl(url: unknown) {
  const value = optionalText(url);
  const marker = "/api/files/";
  const index = value.indexOf(marker);
  if (index < 0) return "";
  return decodeURIComponent(value.slice(index + marker.length).split(/[/?#]/)[0] ?? "");
}

function optionalText(value: unknown) {
  return value === undefined || value === null ? "" : String(value).trim();
}
