// EE功能已禁用 - Stub实现
export interface IBilling {
  plan: string;
}

export interface IBillingPlan {
  id: string;
  name: string;
}

export enum BillingPlan {
  FREE = 'free',
  PRO = 'pro',
}
