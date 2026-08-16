import { CATALOG_MODELS } from '../domain/catalog';
import type { RepairIssueId } from './types';

/**
 * Central repair price book — edit here, never in UI components.
 * `model: '*'` = default for all models; model-specific rows override.
 */
export interface RepairServicePrice {
  /** Catalog model name or `*` for default. */
  model: string;
  service: RepairIssueId;
  priceFrom: number | null;
  priceTo: number | null;
  /** Human-readable ETA, e.g. „1–2 dni robocze”. */
  estimatedTime: string;
}

/** Default / fallback prices by service (PLN). */
const DEFAULT_SERVICES: Omit<RepairServicePrice, 'model'>[] = [
  { service: 'screen', priceFrom: 349, priceTo: 899, estimatedTime: '1–2 dni robocze' },
  { service: 'battery', priceFrom: 249, priceTo: 449, estimatedTime: 'tego samego dnia' },
  { service: 'charging', priceFrom: 199, priceTo: 349, estimatedTime: '1 dzień roboczy' },
  { service: 'camera', priceFrom: 279, priceTo: 599, estimatedTime: '1–2 dni robocze' },
  { service: 'speaker', priceFrom: 179, priceTo: 329, estimatedTime: '1 dzień roboczy' },
  { service: 'microphone', priceFrom: 179, priceTo: 329, estimatedTime: '1 dzień roboczy' },
  { service: 'face_id', priceFrom: 399, priceTo: 799, estimatedTime: '2–3 dni robocze' },
  { service: 'back_glass', priceFrom: 299, priceTo: 549, estimatedTime: '1–2 dni robocze' },
  { service: 'liquid', priceFrom: null, priceTo: null, estimatedTime: 'po diagnozie' },
  { service: 'no_power', priceFrom: null, priceTo: null, estimatedTime: 'po diagnozie' },
  { service: 'buttons', priceFrom: 149, priceTo: 299, estimatedTime: '1 dzień roboczy' },
  { service: 'network', priceFrom: 199, priceTo: 449, estimatedTime: '1–2 dni robocze' },
  { service: 'other', priceFrom: null, priceTo: null, estimatedTime: 'po diagnozie' },
];

/** Optional model-specific overrides (newer Pro = higher screen/battery floors). */
const MODEL_OVERRIDES: RepairServicePrice[] = [
  {
    model: 'iPhone 15 Pro',
    service: 'screen',
    priceFrom: 699,
    priceTo: 999,
    estimatedTime: '1–2 dni robocze',
  },
  {
    model: 'iPhone 15 Pro Max',
    service: 'screen',
    priceFrom: 749,
    priceTo: 1099,
    estimatedTime: '1–2 dni robocze',
  },
  {
    model: 'iPhone 16 Pro',
    service: 'screen',
    priceFrom: 799,
    priceTo: 1199,
    estimatedTime: '1–2 dni robocze',
  },
  {
    model: 'iPhone 16 Pro Max',
    service: 'screen',
    priceFrom: 849,
    priceTo: 1299,
    estimatedTime: '1–2 dni robocze',
  },
  {
    model: 'iPhone 17 Pro',
    service: 'screen',
    priceFrom: 899,
    priceTo: 1399,
    estimatedTime: '1–2 dni robocze',
  },
  {
    model: 'iPhone 17 Pro Max',
    service: 'screen',
    priceFrom: 949,
    priceTo: 1499,
    estimatedTime: '1–2 dni robocze',
  },
];

export const repairServices: RepairServicePrice[] = [
  ...MODEL_OVERRIDES,
  ...CATALOG_MODELS.flatMap((model) =>
    DEFAULT_SERVICES.map((row) => ({ model, ...row })),
  ),
];

export interface RepairEstimate {
  priceFrom: number | null;
  priceTo: number | null;
  estimatedTime: string | null;
  /** Ready-to-show line, e.g. „od 349 zł” or custom individual message. */
  label: string;
  hasPricedService: boolean;
  lines: { service: RepairIssueId; label: string }[];
}

function lookup(model: string, service: RepairIssueId): RepairServicePrice | undefined {
  // Overrides are listed first in repairServices.
  const specific = repairServices.find(
    (r) => r.model === model && r.service === service,
  );
  if (specific) return specific;
  return repairServices.find((r) => r.model === '*' && r.service === service);
}

/**
 * Pure estimate — UI must only call this, never embed price math.
 * For multiple issues, uses the lowest non-null `priceFrom` among selected services
 * and the highest non-null `priceTo` (range), or individual if none priced.
 */
export function estimateRepairPrice(
  model: string,
  issues: RepairIssueId[],
): RepairEstimate {
  if (!issues.length) {
    return {
      priceFrom: null,
      priceTo: null,
      estimatedTime: null,
      label: 'Cena ustalana indywidualnie po diagnozie.',
      hasPricedService: false,
      lines: [],
    };
  }

  const rows = issues
    .map((service) => lookup(model, service))
    .filter((r): r is RepairServicePrice => Boolean(r));

  const priced = rows.filter((r) => r.priceFrom != null);
  const lines = issues.map((service) => {
    const row = lookup(model, service);
    if (!row || row.priceFrom == null) {
      return { service, label: 'po diagnozie' };
    }
    const to =
      row.priceTo != null && row.priceTo !== row.priceFrom
        ? `–${row.priceTo.toLocaleString('pl-PL')}`
        : '';
    return {
      service,
      label: `od ${row.priceFrom.toLocaleString('pl-PL')}${to} zł`,
    };
  });

  if (!priced.length) {
    return {
      priceFrom: null,
      priceTo: null,
      estimatedTime: rows[0]?.estimatedTime ?? 'po diagnozie',
      label: 'Cena ustalana indywidualnie po diagnozie.',
      hasPricedService: false,
      lines,
    };
  }

  const priceFrom = Math.min(...priced.map((r) => r.priceFrom as number));
  const tos = priced
    .map((r) => r.priceTo)
    .filter((v): v is number => v != null);
  const priceTo = tos.length ? Math.max(...tos) : null;
  const estimatedTime =
    priced.find((r) => r.service === issues[0])?.estimatedTime ??
    priced[0].estimatedTime;

  return {
    priceFrom,
    priceTo,
    estimatedTime,
    label: `od ${priceFrom.toLocaleString('pl-PL')} zł`,
    hasPricedService: true,
    lines,
  };
}

export function repairModels(): readonly string[] {
  return CATALOG_MODELS;
}
