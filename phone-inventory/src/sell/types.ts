/** Sell-your-iPhone feature types (ready for future `sell_requests` table). */

export type SellCondition = 'idealny' | 'bardzo_dobry' | 'dobry' | 'uszkodzony';

export type SellBatteryHealth = '90_100' | '80_89' | 'below_80' | 'unknown';

export type YesNo = 'yes' | 'no';
export type YesNoUnknown = 'yes' | 'no' | 'unknown';

export type SellDeliveryMethod = 'courier' | 'in_person';

export type SellRequestStatus =
  | 'new'
  | 'contacted'
  | 'accepted'
  | 'received'
  | 'verified'
  | 'paid'
  | 'cancelled';

export type SellWizardStep =
  | 'model'
  | 'storage'
  | 'condition'
  | 'battery'
  | 'technical'
  | 'quote'
  | 'contact'
  | 'delivery'
  | 'review'
  | 'done';

export const SELL_WIZARD_STEPS: SellWizardStep[] = [
  'model',
  'storage',
  'condition',
  'battery',
  'technical',
  'quote',
  'contact',
  'delivery',
  'review',
];

export interface SellTechnicalAnswers {
  screenOriginal: YesNoUnknown;
  wasRepaired: YesNoUnknown;
  faceIdWorks: YesNo;
  camerasWork: YesNo;
  chargesNormally: YesNo;
  freeFromIcloudLock: YesNo;
  carrierLocked: YesNoUnknown;
  bodyDamaged: YesNo;
}

export interface SellContactForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  bankAccount: string;
  acceptedTerms: boolean;
}

export interface SellQuoteInput {
  model: string;
  storage: string;
  condition: SellCondition;
  batteryHealth: SellBatteryHealth;
  technical: SellTechnicalAnswers;
}

export interface SellQuoteResult {
  estimatedPrice: number;
  currency: 'PLN';
  basePrice: number;
  adjustments: { label: string; amount: number }[];
}

/** Payload shaped like future Supabase `sell_requests` row. */
export interface SellRequest {
  id: string;
  createdAt: string;
  userId?: string | null;
  model: string;
  storage: string;
  condition: SellCondition;
  batteryHealth: SellBatteryHealth;
  screenOriginal: YesNoUnknown;
  wasRepaired: YesNoUnknown;
  faceId: YesNo;
  cameras: YesNo;
  charging: YesNo;
  icloudLockFree: YesNo;
  carrierLock: YesNoUnknown;
  bodyDamaged: YesNo;
  estimatedPrice: number;
  sellerName: string;
  sellerEmail: string;
  sellerPhone: string;
  bankAccount?: string | null;
  deliveryMethod: SellDeliveryMethod;
  status: SellRequestStatus;
  referenceNumber: string;
}

export const EMPTY_TECHNICAL: SellTechnicalAnswers = {
  screenOriginal: 'yes',
  wasRepaired: 'no',
  faceIdWorks: 'yes',
  camerasWork: 'yes',
  chargesNormally: 'yes',
  freeFromIcloudLock: 'yes',
  carrierLocked: 'no',
  bodyDamaged: 'no',
};

export const EMPTY_CONTACT: SellContactForm = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  bankAccount: '',
  acceptedTerms: false,
};

export const SELL_CONDITION_OPTIONS: {
  value: SellCondition;
  title: string;
  description: string;
}[] = [
  {
    value: 'idealny',
    title: 'Idealny',
    description: 'Brak widocznych śladów użytkowania',
  },
  {
    value: 'bardzo_dobry',
    title: 'Bardzo dobry',
    description: 'Drobne ślady użytkowania',
  },
  {
    value: 'dobry',
    title: 'Dobry',
    description: 'Widoczne ślady użytkowania',
  },
  {
    value: 'uszkodzony',
    title: 'Uszkodzony',
    description: 'Pęknięcia, uszkodzenia lub problemy techniczne',
  },
];

export const SELL_BATTERY_OPTIONS: {
  value: SellBatteryHealth;
  label: string;
}[] = [
  { value: '90_100', label: '90–100%' },
  { value: '80_89', label: '80–89%' },
  { value: 'below_80', label: 'Poniżej 80%' },
  { value: 'unknown', label: 'Nie wiem' },
];
