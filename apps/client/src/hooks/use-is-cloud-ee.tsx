import { isCloud } from "@/lib/config";

// EE功能已移除 - 内网部署版本
export const useIsCloudEE = () => {
  return isCloud();
}; 