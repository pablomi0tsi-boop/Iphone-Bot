import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CATALOG_MODELS } from '../domain/catalog';
import { useAuth } from '../hooks/useAuth';
import { formatPricePln } from '../store/format';
import { productImageForModel } from '../store/productImages';
import { estimateBuybackPrice, storagesForSellModel } from './pricing';
import { sellRequestRepository } from './sellRequestRepo';
import {
  EMPTY_CONTACT,
  EMPTY_TECHNICAL,
  SELL_BATTERY_OPTIONS,
  SELL_CONDITION_OPTIONS,
  SELL_WIZARD_STEPS,
  type SellBatteryHealth,
  type SellCondition,
  type SellContactForm,
  type SellDeliveryMethod,
  type SellRequest,
  type SellTechnicalAnswers,
  type SellWizardStep,
  type YesNo,
  type YesNoUnknown,
} from './types';

const STEP_TITLES: Record<Exclude<SellWizardStep, 'done'>, string> = {
  model: 'Model',
  storage: 'Pamięć',
  condition: 'Stan',
  battery: 'Bateria',
  technical: 'Sprawność',
  quote: 'Wycena',
  contact: 'Dane',
  delivery: 'Przekazanie',
  review: 'Podsumowanie',
};

export function SellWizard({ onCancel }: { onCancel: () => void }) {
  const { user } = useAuth();
  const [step, setStep] = useState<SellWizardStep>('model');
  const [model, setModel] = useState('');
  const [storage, setStorage] = useState('');
  const [condition, setCondition] = useState<SellCondition | ''>('');
  const [batteryHealth, setBatteryHealth] = useState<SellBatteryHealth | ''>(
    '',
  );
  const [technical, setTechnical] =
    useState<SellTechnicalAnswers>(EMPTY_TECHNICAL);
  const [contact, setContact] = useState<SellContactForm>(EMPTY_CONTACT);
  const [deliveryMethod, setDeliveryMethod] =
    useState<SellDeliveryMethod | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<SellRequest | null>(null);

  const storages = useMemo(
    () => (model ? storagesForSellModel(model) : []),
    [model],
  );

  const quote = useMemo(() => {
    if (!model || !storage || !condition || !batteryHealth) return null;
    return estimateBuybackPrice({
      model,
      storage,
      condition,
      batteryHealth,
      technical,
    });
  }, [model, storage, condition, batteryHealth, technical]);

  const progressIndex = SELL_WIZARD_STEPS.indexOf(
    step === 'done' ? 'review' : step,
  );
  const progressTotal = SELL_WIZARD_STEPS.length;

  const goNext = () => {
    const idx = SELL_WIZARD_STEPS.indexOf(step as Exclude<SellWizardStep, 'done'>);
    if (idx >= 0 && idx < SELL_WIZARD_STEPS.length - 1) {
      setStep(SELL_WIZARD_STEPS[idx + 1]);
    }
  };

  const goBack = () => {
    if (step === 'model') {
      onCancel();
      return;
    }
    const idx = SELL_WIZARD_STEPS.indexOf(step as Exclude<SellWizardStep, 'done'>);
    if (idx > 0) setStep(SELL_WIZARD_STEPS[idx - 1]);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!quote || !condition || !batteryHealth || !deliveryMethod) return;
    if (!contact.acceptedTerms) {
      setSubmitError('Zaakceptuj regulamin i politykę prywatności.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const request = await sellRequestRepository.create({
        userId: user?.id ?? null,
        model,
        storage,
        condition,
        batteryHealth,
        screenOriginal: technical.screenOriginal,
        wasRepaired: technical.wasRepaired,
        faceId: technical.faceIdWorks,
        cameras: technical.camerasWork,
        charging: technical.chargesNormally,
        icloudLockFree: technical.freeFromIcloudLock,
        carrierLock: technical.carrierLocked,
        bodyDamaged: technical.bodyDamaged,
        estimatedPrice: quote.estimatedPrice,
        sellerName: `${contact.firstName.trim()} ${contact.lastName.trim()}`.trim(),
        sellerEmail: contact.email.trim(),
        sellerPhone: contact.phone.trim(),
        bankAccount: contact.bankAccount.trim() || null,
        deliveryMethod,
      });
      setSubmitted(request);
      setStep('done');
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Nie udało się wysłać zgłoszenia.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (step === 'done' && submitted) {
    return (
      <div className="sell-panel sell-success" role="status">
        <p className="sf-eyebrow">Zgłoszenie</p>
        <h2>Gotowe! Otrzymaliśmy Twoje zgłoszenie.</h2>
        <p className="sf-muted">
          Skontaktujemy się z Tobą w sprawie dalszego procesu.
        </p>
        <p className="sell-ref">
          Numer zgłoszenia: <strong>#{submitted.referenceNumber}</strong>
        </p>
        <div className="sell-actions">
          <Link to="/sklep" className="btn primary">
            Przejdź do sklepu
          </Link>
          <button type="button" className="btn ghost" onClick={onCancel}>
            Sprzedaj kolejny iPhone
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sell-panel">
      <div className="sell-progress" aria-label="Postęp wyceny">
        <div className="sell-progress-meta">
          <span>
            Krok {progressIndex + 1} z {progressTotal}
          </span>
          <span>{STEP_TITLES[step as Exclude<SellWizardStep, 'done'>]}</span>
        </div>
        <div className="sell-progress-bar">
          <span
            style={{
              width: `${((progressIndex + 1) / progressTotal) * 100}%`,
            }}
          />
        </div>
      </div>

      <div key={step} className="sell-step">
        {step === 'model' ? (
          <StepModel
            value={model}
            onSelect={(next) => {
              setModel(next);
              setStorage('');
              goNextSoon(() => setStep('storage'));
            }}
          />
        ) : null}

        {step === 'storage' ? (
          <StepStorage
            model={model}
            options={storages}
            value={storage}
            onSelect={(next) => {
              setStorage(next);
              goNextSoon(() => setStep('condition'));
            }}
          />
        ) : null}

        {step === 'condition' ? (
          <StepCondition
            value={condition}
            onSelect={(next) => {
              setCondition(next);
              goNextSoon(() => setStep('battery'));
            }}
          />
        ) : null}

        {step === 'battery' ? (
          <StepBattery
            value={batteryHealth}
            onSelect={(next) => {
              setBatteryHealth(next);
              goNextSoon(() => setStep('technical'));
            }}
          />
        ) : null}

        {step === 'technical' ? (
          <StepTechnical
            value={technical}
            onChange={setTechnical}
            onContinue={() => setStep('quote')}
          />
        ) : null}

        {step === 'quote' && quote ? (
          <StepQuote
            model={model}
            storage={storage}
            condition={condition as SellCondition}
            batteryHealth={batteryHealth as SellBatteryHealth}
            technical={technical}
            price={quote.estimatedPrice}
            onAccept={() => setStep('contact')}
            onEdit={() => setStep('model')}
          />
        ) : null}

        {step === 'contact' ? (
          <StepContact
            value={contact}
            onChange={setContact}
            onContinue={() => {
              const err = validateContact(contact);
              if (err) {
                setSubmitError(err);
                return;
              }
              setSubmitError(null);
              setStep('delivery');
            }}
            error={submitError}
          />
        ) : null}

        {step === 'delivery' ? (
          <StepDelivery
            value={deliveryMethod}
            onSelect={setDeliveryMethod}
            onContinue={() => {
              if (!deliveryMethod) return;
              setStep('review');
            }}
          />
        ) : null}

        {step === 'review' && quote && condition && batteryHealth && deliveryMethod ? (
          <StepReview
            model={model}
            storage={storage}
            condition={condition}
            batteryHealth={batteryHealth}
            contact={contact}
            deliveryMethod={deliveryMethod}
            price={quote.estimatedPrice}
            submitting={submitting}
            error={submitError}
            onSubmit={submit}
          />
        ) : null}
      </div>

      {step !== 'done' ? (
        <div className="sell-nav">
          <button type="button" className="btn ghost" onClick={goBack}>
            Wstecz
          </button>
          {step !== 'model' &&
          step !== 'storage' &&
          step !== 'condition' &&
          step !== 'battery' &&
          step !== 'technical' &&
          step !== 'quote' &&
          step !== 'contact' &&
          step !== 'delivery' &&
          step !== 'review' ? (
            <button type="button" className="btn primary" onClick={goNext}>
              Dalej
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function goNextSoon(fn: () => void) {
  window.setTimeout(fn, 180);
}

function validateContact(contact: SellContactForm): string | null {
  if (!contact.firstName.trim()) return 'Podaj imię.';
  if (!contact.lastName.trim()) return 'Podaj nazwisko.';
  if (!contact.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) {
    return 'Podaj prawidłowy adres e-mail.';
  }
  if (!contact.phone.trim() || contact.phone.replace(/\D/g, '').length < 9) {
    return 'Podaj prawidłowy numer telefonu.';
  }
  if (!contact.acceptedTerms) {
    return 'Zaakceptuj regulamin i politykę prywatności.';
  }
  return null;
}

function StepModel({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (model: string) => void;
}) {
  return (
    <div>
      <h2>Jaki model iPhone&apos;a chcesz sprzedać?</h2>
      <p className="sf-muted">Wybierz dokładny model urządzenia.</p>
      <div className="sell-model-grid">
        {CATALOG_MODELS.map((name) => {
          const img = productImageForModel(name);
          return (
            <button
              key={name}
              type="button"
              className={`sell-model-card ${value === name ? 'on' : ''}`}
              onClick={() => onSelect(name)}
            >
              {img ? (
                <img src={img} alt="" loading="lazy" />
              ) : (
                <span className="sell-model-fallback">{name}</span>
              )}
              <span>{name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepStorage({
  model,
  options,
  value,
  onSelect,
}: {
  model: string;
  options: string[];
  value: string;
  onSelect: (storage: string) => void;
}) {
  return (
    <div>
      <h2>Ile pamięci ma Twój iPhone?</h2>
      <p className="sf-muted">
        Pojemności dostępne dla modelu <strong>{model}</strong>.
      </p>
      <div className="sell-choice-grid">
        {options.map((storage) => (
          <button
            key={storage}
            type="button"
            className={`sell-choice ${value === storage ? 'on' : ''}`}
            onClick={() => onSelect(storage)}
          >
            {storage}
          </button>
        ))}
      </div>
    </div>
  );
}

function StepCondition({
  value,
  onSelect,
}: {
  value: SellCondition | '';
  onSelect: (v: SellCondition) => void;
}) {
  return (
    <div>
      <h2>W jakim stanie jest iPhone?</h2>
      <div className="sell-condition-grid">
        {SELL_CONDITION_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`sell-condition-card ${value === opt.value ? 'on' : ''}`}
            onClick={() => onSelect(opt.value)}
          >
            <strong>{opt.title}</strong>
            <span>{opt.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function StepBattery({
  value,
  onSelect,
}: {
  value: SellBatteryHealth | '';
  onSelect: (v: SellBatteryHealth) => void;
}) {
  return (
    <div>
      <h2>Jaka jest kondycja baterii?</h2>
      <div className="sell-choice-grid">
        {SELL_BATTERY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`sell-choice ${value === opt.value ? 'on' : ''}`}
            onClick={() => onSelect(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function StepTechnical({
  value,
  onChange,
  onContinue,
}: {
  value: SellTechnicalAnswers;
  onChange: (next: SellTechnicalAnswers) => void;
  onContinue: () => void;
}) {
  const set = <K extends keyof SellTechnicalAnswers>(key: K, v: SellTechnicalAnswers[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div>
      <h2>Kilka pytań o sprawność</h2>
      <p className="sf-muted">Pomaga nam podać dokładniejszą wycenę.</p>
      <div className="sell-tech-list">
        <TechQuestionYnu
          label="Czy ekran jest oryginalny?"
          value={value.screenOriginal}
          onChange={(v) => set('screenOriginal', v)}
        />
        <TechQuestionYnu
          label="Czy telefon był naprawiany?"
          value={value.wasRepaired}
          onChange={(v) => set('wasRepaired', v)}
        />
        <TechQuestionYn
          label="Czy Face ID działa?"
          value={value.faceIdWorks}
          onChange={(v) => set('faceIdWorks', v)}
        />
        <TechQuestionYn
          label="Czy wszystkie aparaty działają?"
          value={value.camerasWork}
          onChange={(v) => set('camerasWork', v)}
        />
        <TechQuestionYn
          label="Czy telefon się normalnie ładuje?"
          value={value.chargesNormally}
          onChange={(v) => set('chargesNormally', v)}
        />
        <TechQuestionYn
          label="Czy telefon jest wolny od blokady iCloud / Activation Lock?"
          value={value.freeFromIcloudLock}
          onChange={(v) => set('freeFromIcloudLock', v)}
        />
        <TechQuestionYnu
          label="Czy telefon jest zablokowany przez operatora?"
          value={value.carrierLocked}
          onChange={(v) => set('carrierLocked', v)}
        />
        <TechQuestionYn
          label="Czy obudowa lub tylna szyba jest uszkodzona?"
          value={value.bodyDamaged}
          onChange={(v) => set('bodyDamaged', v)}
        />
      </div>
      <div className="sell-actions">
        <button type="button" className="btn primary" onClick={onContinue}>
          Zobacz wycenę
        </button>
      </div>
    </div>
  );
}

function TechQuestionYn({
  label,
  value,
  onChange,
}: {
  label: string;
  value: YesNo;
  onChange: (v: YesNo) => void;
}) {
  return (
    <fieldset className="sell-tech-q">
      <legend>{label}</legend>
      <div className="sell-seg">
        {(
          [
            { value: 'yes', label: 'Tak' },
            { value: 'no', label: 'Nie' },
          ] as const
        ).map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={value === opt.value ? 'on' : ''}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function TechQuestionYnu({
  label,
  value,
  onChange,
}: {
  label: string;
  value: YesNoUnknown;
  onChange: (v: YesNoUnknown) => void;
}) {
  return (
    <fieldset className="sell-tech-q">
      <legend>{label}</legend>
      <div className="sell-seg">
        {(
          [
            { value: 'yes', label: 'Tak' },
            { value: 'no', label: 'Nie' },
            { value: 'unknown', label: 'Nie wiem' },
          ] as const
        ).map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={value === opt.value ? 'on' : ''}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function StepQuote({
  model,
  storage,
  condition,
  batteryHealth,
  technical,
  price,
  onAccept,
  onEdit,
}: {
  model: string;
  storage: string;
  condition: SellCondition;
  batteryHealth: SellBatteryHealth;
  technical: SellTechnicalAnswers;
  price: number;
  onAccept: () => void;
  onEdit: () => void;
}) {
  const conditionLabel =
    SELL_CONDITION_OPTIONS.find((c) => c.value === condition)?.title ?? condition;
  const batteryLabel =
    SELL_BATTERY_OPTIONS.find((b) => b.value === batteryHealth)?.label ??
    batteryHealth;

  return (
    <div className="sell-quote">
      <h2>Szacowana wartość Twojego iPhone&apos;a</h2>
      <p className="sell-quote-price">{formatPricePln(price)}</p>
      <p className="sf-muted">
        Ostateczna cena może zostać potwierdzona po sprawdzeniu urządzenia.
      </p>
      <ul className="sell-summary-list">
        <li>
          <strong>{model}</strong>
        </li>
        <li>{storage}</li>
        <li>Stan: {conditionLabel}</li>
        <li>Bateria: {batteryLabel}</li>
        <li>Face ID: {technical.faceIdWorks === 'yes' ? 'Sprawne' : 'Niesprawne'}</li>
        <li>
          Ekran:{' '}
          {technical.screenOriginal === 'yes'
            ? 'Oryginalny'
            : technical.screenOriginal === 'no'
              ? 'Nieoryginalny'
              : 'Niepewny'}
        </li>
      </ul>
      <div className="sell-actions">
        <button type="button" className="btn primary" onClick={onAccept}>
          Akceptuję wycenę
        </button>
        <button type="button" className="btn ghost" onClick={onEdit}>
          Wróć i popraw dane
        </button>
      </div>
    </div>
  );
}

function StepContact({
  value,
  onChange,
  onContinue,
  error,
}: {
  value: SellContactForm;
  onChange: (next: SellContactForm) => void;
  onContinue: () => void;
  error: string | null;
}) {
  const set = <K extends keyof SellContactForm>(key: K, v: SellContactForm[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div>
      <h2>Podaj dane, abyśmy mogli się z Tobą skontaktować</h2>
      <div className="sell-form-grid">
        <label className="sf-field">
          <span>Imię</span>
          <input
            required
            value={value.firstName}
            onChange={(e) => set('firstName', e.target.value)}
          />
        </label>
        <label className="sf-field">
          <span>Nazwisko</span>
          <input
            required
            value={value.lastName}
            onChange={(e) => set('lastName', e.target.value)}
          />
        </label>
        <label className="sf-field">
          <span>E-mail</span>
          <input
            type="email"
            required
            value={value.email}
            onChange={(e) => set('email', e.target.value)}
          />
        </label>
        <label className="sf-field">
          <span>Numer telefonu</span>
          <input
            type="tel"
            required
            value={value.phone}
            onChange={(e) => set('phone', e.target.value)}
          />
        </label>
        <label className="sf-field sell-span-2">
          <span>Numer konta bankowego (opcjonalnie)</span>
          <input
            value={value.bankAccount}
            onChange={(e) => set('bankAccount', e.target.value)}
            placeholder="PL00 0000 0000 0000 0000 0000 0000"
          />
        </label>
      </div>
      <label className="sell-check">
        <input
          type="checkbox"
          checked={value.acceptedTerms}
          onChange={(e) => set('acceptedTerms', e.target.checked)}
        />
        <span>
          Akceptuję <Link to="/regulamin">regulamin</Link> i{' '}
          <Link to="/polityka-prywatnosci">politykę prywatności</Link>.
        </span>
      </label>
      {error ? (
        <p className="sell-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="sell-actions">
        <button type="button" className="btn primary" onClick={onContinue}>
          Dalej
        </button>
      </div>
    </div>
  );
}

function StepDelivery({
  value,
  onSelect,
  onContinue,
}: {
  value: SellDeliveryMethod | '';
  onSelect: (v: SellDeliveryMethod) => void;
  onContinue: () => void;
}) {
  return (
    <div>
      <h2>Jak chcesz przekazać telefon?</h2>
      <div className="sell-condition-grid">
        <button
          type="button"
          className={`sell-condition-card ${value === 'courier' ? 'on' : ''}`}
          onClick={() => onSelect('courier')}
        >
          <strong>📦 Wysyłka kurierem</strong>
          <span>
            Po zaakceptowaniu wyceny otrzymasz instrukcję wysyłki telefonu.
          </span>
        </button>
        <button
          type="button"
          className={`sell-condition-card ${value === 'in_person' ? 'on' : ''}`}
          onClick={() => onSelect('in_person')}
        >
          <strong>🏪 Dostarczenie telefonu osobiście</strong>
          <span>
            Umówimy dogodny termin przekazania urządzenia w SmartFix.
          </span>
        </button>
      </div>
      <div className="sell-actions">
        <button
          type="button"
          className="btn primary"
          disabled={!value}
          onClick={onContinue}
        >
          Dalej
        </button>
      </div>
    </div>
  );
}

function StepReview({
  model,
  storage,
  condition,
  batteryHealth,
  contact,
  deliveryMethod,
  price,
  submitting,
  error,
  onSubmit,
}: {
  model: string;
  storage: string;
  condition: SellCondition;
  batteryHealth: SellBatteryHealth;
  contact: SellContactForm;
  deliveryMethod: SellDeliveryMethod;
  price: number;
  submitting: boolean;
  error: string | null;
  onSubmit: (e: FormEvent) => void;
}) {
  const conditionLabel =
    SELL_CONDITION_OPTIONS.find((c) => c.value === condition)?.title ?? condition;
  const batteryLabel =
    SELL_BATTERY_OPTIONS.find((b) => b.value === batteryHealth)?.label ??
    batteryHealth;

  return (
    <form onSubmit={onSubmit}>
      <h2>Podsumowanie</h2>
      <div className="sell-review-grid">
        <section>
          <h3>Sprzedajesz</h3>
          <ul className="sell-summary-list">
            <li>
              <strong>{model}</strong>
            </li>
            <li>{storage}</li>
            <li>Bateria {batteryLabel}</li>
            <li>Stan: {conditionLabel}</li>
          </ul>
        </section>
        <section>
          <h3>Szacowana cena</h3>
          <p className="sell-quote-price sm">{formatPricePln(price)}</p>
        </section>
        <section>
          <h3>Dane</h3>
          <ul className="sell-summary-list">
            <li>
              {contact.firstName} {contact.lastName}
            </li>
            <li>{contact.phone}</li>
            <li>{contact.email}</li>
          </ul>
        </section>
        <section>
          <h3>Sposób przekazania</h3>
          <p>
            {deliveryMethod === 'courier'
              ? 'Wysyłka kurierem'
              : 'Osobiście w SmartFix'}
          </p>
        </section>
      </div>
      {error ? (
        <p className="sell-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="sell-actions">
        <button type="submit" className="btn primary" disabled={submitting}>
          {submitting ? 'Wysyłanie…' : 'Wyślij zgłoszenie sprzedaży'}
        </button>
      </div>
    </form>
  );
}
