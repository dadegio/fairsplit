export interface ReceiptLine { name: string; amount: number; }
export interface ReceiptScan {
  merchant: string;
  total: number;
  currency: string;
  lines: ReceiptLine[];
  rawText: string;
  confidence: number;
  source: 'tesseract' | 'fallback';
}

function parseMoney(value: string) {
  const cleaned = value.replace(/[^\d,.]/g, '').trim();
  if (!cleaned) return 0;
  const normalized = cleaned.includes(',') && cleaned.includes('.')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned.replace(',', '.');
  return Number.parseFloat(normalized);
}

function parseReceiptText(rawText: string): Omit<ReceiptScan, 'rawText' | 'confidence' | 'source'> {
  const text = rawText.replace(/\r/g, '').replace(/[€]/g, ' EUR ');
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const currency = /\bUSD\b|\$/.test(text) ? 'USD' : /\bGBP\b|£/.test(text) ? 'GBP' : 'EUR';

  const merchant = lines.find(l => !/\d+[,.]\d{2}/.test(l) && !/totale|total|iva|tax|subtotal|pagamento|carta/i.test(l))
    ?? lines[0]
    ?? 'Scontrino';

  const totalCandidates: number[] = [];
  const totalPatterns = [
    /(?:totale\s*(?:complessivo)?|total\s*(?:amount)?|amount\s*due|da\s*pagare|importo)\D{0,20}(\d+[,.]\d{2})/gi,
    /(\d+[,.]\d{2})\D{0,12}(?:totale|total|importo)/gi
  ];
  for (const pattern of totalPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      const value = parseMoney(match[1]);
      if (Number.isFinite(value) && value > 0) totalCandidates.push(value);
    }
  }

  const lineItems: ReceiptLine[] = [];
  const genericAmounts: number[] = [];
  for (const line of lines) {
    const amountMatch = line.match(/(-?\d+[,.]\d{2})\s*(?:EUR|€|$)?\s*$/i);
    if (!amountMatch) continue;
    const amount = parseMoney(amountMatch[1]);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    genericAmounts.push(amount);
    const name = line.replace(amountMatch[0], '').replace(/\s{2,}/g, ' ').trim();
    if (name && !/totale|total|iva|tax|subtotal|resto|contanti|carta/i.test(name)) {
      lineItems.push({ name, amount });
    }
  }

  const total = totalCandidates.length
    ? totalCandidates[totalCandidates.length - 1]
    : genericAmounts.length
      ? Math.max(...genericAmounts)
      : 0;

  return {
    merchant: merchant.slice(0, 60),
    total: Math.round(total * 100) / 100,
    currency,
    lines: lineItems.slice(0, 20)
  };
}

async function runTesseract(imageBase64: string) {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('ita+eng');
  try {
    const result = await worker.recognize(imageBase64);
    return {
      text: result.data.text ?? '',
      confidence: typeof result.data.confidence === 'number' ? result.data.confidence : 0
    };
  } finally {
    await worker.terminate();
  }
}

export async function scanReceipt(imageBase64: string): Promise<ReceiptScan> {
  if (!imageBase64 || imageBase64.length < 100) {
    return {
      merchant: 'Scontrino',
      total: 0,
      currency: 'EUR',
      lines: [],
      rawText: '',
      confidence: 0,
      source: 'fallback'
    };
  }

  try {
    const { text, confidence } = await runTesseract(imageBase64);
    const parsed = parseReceiptText(text);
    return { ...parsed, rawText: text, confidence, source: 'tesseract' };
  } catch (error) {
    const parsed = parseReceiptText('');
    return { ...parsed, rawText: '', confidence: 0, source: 'fallback' };
  }
}
