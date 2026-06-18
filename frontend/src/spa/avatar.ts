import type { ApiClient } from "./api";

type AvatarUser = {
  avatarFileId?: unknown;
  avatarUrl?: unknown;
} | null | undefined;

type FileAsset = {
  fileId?: unknown;
  url?: unknown;
  fileUrl?: unknown;
  mimeType?: unknown;
  type?: unknown;
  name?: unknown;
  originalName?: unknown;
} | null | undefined;

export function avatarImageUrl(user: AvatarUser, api: Pick<ApiClient, "files">) {
  const fileId = optionalText(user?.avatarFileId) || fileIdFromApiFileUrl(user?.avatarUrl);
  if (fileId) return api.files.url(fileId);
  return optionalText(user?.avatarUrl);
}

export function fileAssetUrl(file: FileAsset, api: Pick<ApiClient, "files">) {
  const fileId = optionalText(file?.fileId) || fileIdFromApiFileUrl(file?.url) || fileIdFromApiFileUrl(file?.fileUrl);
  if (fileId) return api.files.url(fileId);
  return optionalText(file?.url ?? file?.fileUrl);
}

export function isImageAsset(file: FileAsset) {
  const mimeType = optionalText(file?.mimeType ?? file?.type).toLowerCase();
  if (mimeType.startsWith("image/")) return true;
  const name = optionalText(file?.name ?? file?.originalName ?? file?.url ?? file?.fileUrl).toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|svg)(?:[?#].*)?$/.test(name);
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
