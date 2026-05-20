export type FeatureFlags = {
  dailyExpenseLimit: number;
  receiptScanning: boolean;
  currencyConversion: boolean;
  analytics: boolean;
  transactionImport: boolean;
  ads: boolean;
};

export const unlockedFeatures: FeatureFlags = {
  dailyExpenseLimit: Number.POSITIVE_INFINITY,
  receiptScanning: true,
  currencyConversion: true,
  analytics: true,
  transactionImport: true,
  ads: false
};

export function featuresForEveryone(): FeatureFlags {
  return unlockedFeatures;
}
