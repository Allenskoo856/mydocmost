// EE功能已禁用 - Stub实现
import { isCloud } from "@/lib/config";
import APP_ROUTE from "@/lib/app-route";

export function exchangeTokenRedirectUrl(token: string) {
  return isCloud() ? `/exchange-token?token=${token}` : APP_ROUTE.HOME;
}

export function getHostnameUrl() {
  return '';
}
