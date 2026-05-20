export interface RateProvider { rate(from: string, to: string): Promise<number>; }
export class MockRateProvider implements RateProvider {
  private rates: Record<string, number> = { 'USD:EUR': 0.92, 'EUR:USD': 1.09, 'GBP:EUR': 1.17, 'EUR:GBP': 0.85 };
  async rate(from: string, to: string) { return from === to ? 1 : (this.rates[`${from}:${to}`] ?? 1); }
}
export async function convert(amount: number, from: string, to: string, provider: RateProvider = new MockRateProvider()) {
  const rate = await provider.rate(from, to);
  return { amount: Math.round(amount * rate * 100) / 100, rate, from, to };
}
