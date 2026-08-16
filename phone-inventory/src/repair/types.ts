/** Repair request feature types (ready for future `repair_requests` table). */

export type YesNoUnknown = 'yes' | 'no' | 'unknown';

export type RepairDeliveryMethod = 'in_person' | 'courier';

export type PreferredContact = 'phone' | 'sms' | 'email';

export type RepairRequestStatus =
  | 'new'
  | 'contacted'
  | 'accepted'
  | 'in_service'
  | 'diagnosing'
  | 'repairing'
  | 'ready'
  | 'completed'
  | 'cancelled';

export type RepairIssueId =
  | 'screen'
  | 'battery'
  | 'charging'
  | 'camera'
  | 'speaker'
  | 'microphone'
  | 'face_id'
  | 'back_glass'
  | 'liquid'
  | 'no_power'
  | 'buttons'
  | 'network'
  | 'other';

export type AdditionalDamageId =
  | 'none'
  | 'cracked_screen'
  | 'cracked_back'
  | 'dents'
  | 'liquid_marks'
  | 'other';

export type RepairWizardStep =
  | 'model'
  | 'issues'
  | 'description'
  | 'damage'
  | 'power'
  | 'estimate'
  | 'delivery'
  | 'contact'
  | 'review'
  | 'done';

/** Progress steps shown as „Krok X z 7” (estimate is interstitial after power). */
export const REPAIR_PROGRESS_STEPS: Exclude<
  RepairWizardStep,
  'estimate' | 'review' | 'done'
>[] = [
  'model',
  'issues',
  'description',
  'damage',
  'power',
  'delivery',
  'contact',
];

export interface RepairIssueOption {
  id: RepairIssueId;
  label: string;
  emoji: string;
}

export interface RepairDamageOption {
  id: AdditionalDamageId;
  label: string;
}

export interface RepairContactForm {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  preferredContact: PreferredContact;
  acceptedTerms: boolean;
}

export interface RepairPhotoMeta {
  id: string;
  name: string;
  size: number;
  /** Object URL for preview — not persisted. */
  previewUrl: string;
}

/** Shape aligned with future Supabase `repair_requests` row. */
export interface RepairRequest {
  id: string;
  createdAt: string;
  userId?: string | null;
  requestNumber: string;
  model: string;
  issues: RepairIssueId[];
  description: string;
  additionalDamage: AdditionalDamageId[];
  phoneTurnsOn: YesNoUnknown;
  chargerReaction: YesNoUnknown | null;
  deliveryMethod: RepairDeliveryMethod;
  estimatedPriceFrom: number | null;
  estimatedPriceTo: number | null;
  estimatedPriceLabel: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  preferredContact: PreferredContact;
  photoNames: string[];
  status: RepairRequestStatus;
}

export const REPAIR_ISSUE_OPTIONS: RepairIssueOption[] = [
  { id: 'screen', label: 'Zbita szybka / ekran', emoji: '🔴' },
  { id: 'battery', label: 'Wymiana baterii', emoji: '🔋' },
  { id: 'charging', label: 'Problem z ładowaniem', emoji: '🔌' },
  { id: 'camera', label: 'Problem z aparatem', emoji: '📷' },
  { id: 'speaker', label: 'Problem z głośnikiem', emoji: '🔊' },
  { id: 'microphone', label: 'Problem z mikrofonem', emoji: '🎤' },
  { id: 'face_id', label: 'Problem z Face ID', emoji: '🔐' },
  { id: 'back_glass', label: 'Uszkodzona tylna szyba', emoji: '📱' },
  { id: 'liquid', label: 'Telefon po zalaniu', emoji: '💧' },
  { id: 'no_power', label: 'Telefon nie włącza się', emoji: '⚡' },
  { id: 'buttons', label: 'Uszkodzone przyciski', emoji: '🔘' },
  { id: 'network', label: 'Problem z siecią / Wi-Fi', emoji: '📶' },
  { id: 'other', label: 'Inna usterka', emoji: '🛠️' },
];

export const REPAIR_DAMAGE_OPTIONS: RepairDamageOption[] = [
  { id: 'none', label: 'Brak dodatkowych uszkodzeń' },
  { id: 'cracked_screen', label: 'Pęknięty ekran' },
  { id: 'cracked_back', label: 'Pęknięta tylna szyba' },
  { id: 'dents', label: 'Wgniecenia obudowy' },
  { id: 'liquid_marks', label: 'Ślady zalania' },
  { id: 'other', label: 'Inne uszkodzenia' },
];

export const EMPTY_REPAIR_CONTACT: RepairContactForm = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  preferredContact: 'phone',
  acceptedTerms: false,
};

export function issueLabel(id: RepairIssueId): string {
  return REPAIR_ISSUE_OPTIONS.find((o) => o.id === id)?.label ?? id;
}

export function damageLabel(id: AdditionalDamageId): string {
  return REPAIR_DAMAGE_OPTIONS.find((o) => o.id === id)?.label ?? id;
}
