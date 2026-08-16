import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { productImageForModel } from '../store/productImages';
import { estimateRepairPrice, repairModels } from './pricing';
import { repairRequestRepository } from './repairRequestRepo';
import {
  EMPTY_REPAIR_CONTACT,
  REPAIR_DAMAGE_OPTIONS,
  REPAIR_ISSUE_OPTIONS,
  REPAIR_PROGRESS_STEPS,
  damageLabel,
  issueLabel,
  type AdditionalDamageId,
  type PreferredContact,
  type RepairContactForm,
  type RepairDeliveryMethod,
  type RepairIssueId,
  type RepairPhotoMeta,
  type RepairRequest,
  type RepairWizardStep,
  type YesNoUnknown,
} from './types';

const STEP_TITLES: Record<
  Exclude<RepairWizardStep, 'done'>,
  string
> = {
  model: 'Model',
  issues: 'Usterka',
  description: 'Opis',
  damage: 'Stan',
  power: 'Diagnoza',
  estimate: 'Wycena',
  delivery: 'Przekazanie',
  contact: 'Dane',
  review: 'Podsumowanie',
};

export function RepairWizard({
  onCancel,
  initialIssues = [],
}: {
  onCancel: () => void;
  initialIssues?: RepairIssueId[];
}) {
  const { user } = useAuth();
  const panelRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<RepairWizardStep>(
    initialIssues.length ? 'model' : 'model',
  );
  const [model, setModel] = useState('');
  const [issues, setIssues] = useState<RepairIssueId[]>(initialIssues);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<RepairPhotoMeta[]>([]);
  const [damage, setDamage] = useState<AdditionalDamageId[]>([]);
  const [phoneTurnsOn, setPhoneTurnsOn] = useState<YesNoUnknown | ''>('');
  const [chargerReaction, setChargerReaction] = useState<YesNoUnknown | ''>(
    '',
  );
  const [deliveryMethod, setDeliveryMethod] =
    useState<RepairDeliveryMethod | ''>('');
  const [contact, setContact] = useState<RepairContactForm>(EMPTY_REPAIR_CONTACT);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<RepairRequest | null>(null);

  const photosRef = useRef(photos);
  photosRef.current = photos;

  useEffect(() => {
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [step]);

  useEffect(() => {
    return () => {
      photosRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
  }, []);

  const estimate = useMemo(
    () => (model && issues.length ? estimateRepairPrice(model, issues) : null),
    [model, issues],
  );

  const progressStep: (typeof REPAIR_PROGRESS_STEPS)[number] =
    step === 'estimate'
      ? 'power'
      : step === 'review' || step === 'done'
        ? 'contact'
        : (step as (typeof REPAIR_PROGRESS_STEPS)[number]);
  const progressIndex = REPAIR_PROGRESS_STEPS.indexOf(progressStep);
  const progressTotal = REPAIR_PROGRESS_STEPS.length;

  const goBack = () => {
    setStepError(null);
    if (step === 'model') {
      onCancel();
      return;
    }
    const order: RepairWizardStep[] = [
      'model',
      'issues',
      'description',
      'damage',
      'power',
      'estimate',
      'delivery',
      'contact',
      'review',
    ];
    const idx = order.indexOf(step);
    if (idx > 0) setStep(order[idx - 1]);
  };

  const toggleIssue = (id: RepairIssueId) => {
    setIssues((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleDamage = (id: AdditionalDamageId) => {
    setDamage((prev) => {
      if (id === 'none') return ['none'];
      const withoutNone = prev.filter((x) => x !== 'none');
      if (withoutNone.includes(id)) {
        const next = withoutNone.filter((x) => x !== id);
        return next.length ? next : [];
      }
      return [...withoutNone, id];
    });
  };

  const onPhotosSelected = (files: FileList | null) => {
    if (!files?.length) return;
    const next: RepairPhotoMeta[] = [];
    for (const file of Array.from(files).slice(0, 6 - photos.length)) {
      if (!file.type.startsWith('image/')) continue;
      next.push({
        id: `${file.name}-${file.size}-${Date.now()}`,
        name: file.name,
        size: file.size,
        previewUrl: URL.createObjectURL(file),
      });
    }
    setPhotos((prev) => [...prev, ...next].slice(0, 6));
  };

  const removePhoto = (id: string) => {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!estimate || !phoneTurnsOn || !deliveryMethod) return;
    const err = validateContact(contact);
    if (err) {
      setSubmitError(err);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const request = await repairRequestRepository.create({
        userId: user?.id ?? null,
        model,
        issues,
        description: description.trim(),
        additionalDamage: damage.length ? damage : ['none'],
        phoneTurnsOn,
        chargerReaction:
          phoneTurnsOn === 'no'
            ? chargerReaction || null
            : null,
        deliveryMethod,
        estimatedPriceFrom: estimate.priceFrom,
        estimatedPriceTo: estimate.priceTo,
        estimatedPriceLabel: estimate.label,
        customerName: `${contact.firstName.trim()} ${contact.lastName.trim()}`.trim(),
        customerEmail: contact.email.trim(),
        customerPhone: contact.phone.trim(),
        preferredContact: contact.preferredContact,
        photoNames: photos.map((p) => p.name),
      });
      setSubmitted(request);
      setStep('done');
    } catch (e) {
      setSubmitError(
        e instanceof Error ? e.message : 'Nie udało się wysłać zgłoszenia.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (step === 'done' && submitted) {
    return (
      <div className="repair-panel repair-success" role="status" ref={panelRef}>
        <p className="repair-kicker">Zgłoszenie</p>
        <h2>Zgłoszenie zostało wysłane!</h2>
        <p className="repair-muted">
          Skontaktujemy się z Tobą, aby potwierdzić szczegóły naprawy.
        </p>
        <p className="repair-ref">
          Numer zgłoszenia:{' '}
          <strong>#{submitted.requestNumber}</strong>
        </p>
        <div className="repair-actions">
          <Link to="/" className="btn primary">
            Wróć na stronę główną
          </Link>
          <button type="button" className="btn ghost" onClick={onCancel}>
            Nowe zgłoszenie
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="repair-panel" ref={panelRef}>
      <div className="repair-progress" aria-label="Postęp zgłoszenia">
        <div className="repair-progress-meta">
          <span>
            Krok {progressIndex + 1} z {progressTotal}
          </span>
          <span>{STEP_TITLES[step === 'done' ? 'review' : step]}</span>
        </div>
        <div className="repair-progress-bar">
          <span
            style={{
              width: `${((progressIndex + 1) / progressTotal) * 100}%`,
            }}
          />
        </div>
      </div>

      <div key={step} className="repair-step">
        {step === 'model' ? (
          <StepModel
            value={model}
            onSelect={(next) => {
              setModel(next);
              goNextSoon(() => setStep('issues'));
            }}
          />
        ) : null}

        {step === 'issues' ? (
          <StepIssues
            value={issues}
            onToggle={toggleIssue}
            error={stepError}
            onContinue={() => {
              if (!issues.length) {
                setStepError('Wybierz co najmniej jedną usterkę.');
                return;
              }
              setStepError(null);
              setStep('description');
            }}
          />
        ) : null}

        {step === 'description' ? (
          <StepDescription
            description={description}
            photos={photos}
            onDescription={setDescription}
            onPhotos={onPhotosSelected}
            onRemovePhoto={removePhoto}
            onContinue={() => setStep('damage')}
          />
        ) : null}

        {step === 'damage' ? (
          <StepDamage
            value={damage}
            onToggle={toggleDamage}
            error={stepError}
            onContinue={() => {
              if (!damage.length) {
                setStepError('Wybierz stan urządzenia.');
                return;
              }
              setStepError(null);
              setStep('power');
            }}
          />
        ) : null}

        {step === 'power' ? (
          <StepPower
            phoneTurnsOn={phoneTurnsOn}
            chargerReaction={chargerReaction}
            onPhoneTurnsOn={setPhoneTurnsOn}
            onChargerReaction={setChargerReaction}
            error={stepError}
            onContinue={() => {
              if (!phoneTurnsOn) {
                setStepError('Wybierz, czy iPhone się włącza.');
                return;
              }
              if (phoneTurnsOn === 'no' && !chargerReaction) {
                setStepError('Wybierz, czy telefon reaguje na ładowarkę.');
                return;
              }
              setStepError(null);
              setStep('estimate');
            }}
          />
        ) : null}

        {step === 'estimate' && estimate ? (
          <StepEstimate
            estimate={estimate}
            model={model}
            issues={issues}
            onContinue={() => setStep('delivery')}
            onEdit={() => setStep('issues')}
          />
        ) : null}

        {step === 'delivery' ? (
          <StepDelivery
            value={deliveryMethod}
            onSelect={setDeliveryMethod}
            error={stepError}
            onContinue={() => {
              if (!deliveryMethod) {
                setStepError('Wybierz sposób przekazania telefonu.');
                return;
              }
              setStepError(null);
              setStep('contact');
            }}
          />
        ) : null}

        {step === 'contact' ? (
          <StepContact
            value={contact}
            onChange={setContact}
            error={submitError}
            onContinue={() => {
              const err = validateContact(contact);
              if (err) {
                setSubmitError(err);
                return;
              }
              setSubmitError(null);
              setStep('review');
            }}
          />
        ) : null}

        {step === 'review' && estimate && phoneTurnsOn && deliveryMethod ? (
          <StepReview
            model={model}
            issues={issues}
            damage={damage}
            phoneTurnsOn={phoneTurnsOn}
            deliveryMethod={deliveryMethod}
            estimateLabel={estimate.label}
            contact={contact}
            submitting={submitting}
            error={submitError}
            onEdit={() => setStep('model')}
            onSubmit={submit}
          />
        ) : null}
      </div>

      {step !== 'done' ? (
        <div className="repair-nav">
          <button type="button" className="btn ghost" onClick={goBack}>
            Wstecz
          </button>
        </div>
      ) : null}
    </div>
  );
}

function goNextSoon(fn: () => void) {
  window.setTimeout(fn, 180);
}

function validateContact(contact: RepairContactForm): string | null {
  if (!contact.firstName.trim()) return 'Podaj imię.';
  if (!contact.lastName.trim()) return 'Podaj nazwisko.';
  if (!contact.phone.trim() || contact.phone.replace(/\D/g, '').length < 9) {
    return 'Podaj prawidłowy numer telefonu.';
  }
  if (!contact.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) {
    return 'Podaj prawidłowy adres e-mail.';
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
      <h2>Jaki model iPhone&apos;a chcesz naprawić?</h2>
      <p className="repair-muted">Wybierz dokładny model urządzenia.</p>
      <div className="repair-model-grid">
        {repairModels().map((name) => {
          const img = productImageForModel(name);
          return (
            <button
              key={name}
              type="button"
              className={`repair-model-card${value === name ? ' on' : ''}`}
              onClick={() => onSelect(name)}
            >
              {img ? (
                <img src={img} alt="" loading="lazy" />
              ) : (
                <span className="repair-model-fallback">{name}</span>
              )}
              <span>{name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepIssues({
  value,
  onToggle,
  onContinue,
  error,
}: {
  value: RepairIssueId[];
  onToggle: (id: RepairIssueId) => void;
  onContinue: () => void;
  error: string | null;
}) {
  return (
    <div>
      <h2>Co dzieje się z Twoim iPhone&apos;em?</h2>
      <p className="repair-muted">Możesz wybrać jedną lub kilka usterek.</p>
      <div className="repair-issue-grid">
        {REPAIR_ISSUE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`repair-issue-card${value.includes(opt.id) ? ' on' : ''}`}
            onClick={() => onToggle(opt.id)}
          >
            <span className="repair-issue-emoji" aria-hidden>
              {opt.emoji}
            </span>
            <strong>{opt.label}</strong>
          </button>
        ))}
      </div>
      {error ? (
        <p className="repair-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="repair-actions">
        <button type="button" className="btn primary" onClick={onContinue}>
          Dalej
        </button>
      </div>
    </div>
  );
}

function StepDescription({
  description,
  photos,
  onDescription,
  onPhotos,
  onRemovePhoto,
  onContinue,
}: {
  description: string;
  photos: RepairPhotoMeta[];
  onDescription: (v: string) => void;
  onPhotos: (files: FileList | null) => void;
  onRemovePhoto: (id: string) => void;
  onContinue: () => void;
}) {
  return (
    <div>
      <h2>Opisz problem</h2>
      <label className="repair-field">
        <span className="sr-only">Opis usterki</span>
        <textarea
          rows={5}
          value={description}
          onChange={(e) => onDescription(e.target.value)}
          placeholder="Opisz, co dzieje się z telefonem…"
        />
      </label>
      <p className="repair-muted repair-upload-hint">
        Możesz również dodać zdjęcia telefonu. (opcjonalnie)
      </p>
      <div className="repair-upload">
        <label className="btn ghost">
          Dodaj zdjęcia
          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              onPhotos(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
        {photos.length ? (
          <ul className="repair-photo-list">
            {photos.map((p) => (
              <li key={p.id}>
                <img src={p.previewUrl} alt="" />
                <button
                  type="button"
                  className="repair-photo-remove"
                  aria-label={`Usuń ${p.name}`}
                  onClick={() => onRemovePhoto(p.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="repair-actions">
        <button type="button" className="btn primary" onClick={onContinue}>
          Dalej
        </button>
      </div>
    </div>
  );
}

function StepDamage({
  value,
  onToggle,
  onContinue,
  error,
}: {
  value: AdditionalDamageId[];
  onToggle: (id: AdditionalDamageId) => void;
  onContinue: () => void;
  error: string | null;
}) {
  return (
    <div>
      <h2>Czy telefon ma dodatkowe uszkodzenia?</h2>
      <div className="repair-check-grid">
        {REPAIR_DAMAGE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`repair-check-card${value.includes(opt.id) ? ' on' : ''}`}
            onClick={() => onToggle(opt.id)}
          >
            <span aria-hidden>✓</span>
            {opt.label}
          </button>
        ))}
      </div>
      {error ? (
        <p className="repair-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="repair-actions">
        <button type="button" className="btn primary" onClick={onContinue}>
          Dalej
        </button>
      </div>
    </div>
  );
}

function StepPower({
  phoneTurnsOn,
  chargerReaction,
  onPhoneTurnsOn,
  onChargerReaction,
  onContinue,
  error,
}: {
  phoneTurnsOn: YesNoUnknown | '';
  chargerReaction: YesNoUnknown | '';
  onPhoneTurnsOn: (v: YesNoUnknown) => void;
  onChargerReaction: (v: YesNoUnknown) => void;
  onContinue: () => void;
  error: string | null;
}) {
  return (
    <div>
      <h2>Czy iPhone się włącza?</h2>
      <div className="repair-seg">
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
            className={phoneTurnsOn === opt.value ? 'on' : ''}
            onClick={() => onPhoneTurnsOn(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {phoneTurnsOn === 'no' ? (
        <div className="repair-followup">
          <h3>Czy telefon reaguje na podłączenie ładowarki?</h3>
          <div className="repair-seg">
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
                className={chargerReaction === opt.value ? 'on' : ''}
                onClick={() => onChargerReaction(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="repair-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="repair-actions">
        <button type="button" className="btn primary" onClick={onContinue}>
          Zobacz wycenę
        </button>
      </div>
    </div>
  );
}

function StepEstimate({
  estimate,
  model,
  issues,
  onContinue,
  onEdit,
}: {
  estimate: NonNullable<ReturnType<typeof estimateRepairPrice>>;
  model: string;
  issues: RepairIssueId[];
  onContinue: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="repair-estimate">
      <h2>Szacunkowy koszt naprawy</h2>
      {estimate.hasPricedService ? (
        <p className="repair-estimate-price">{estimate.label}</p>
      ) : (
        <p className="repair-estimate-price repair-estimate-price--soft">
          {estimate.label}
        </p>
      )}
      <p className="repair-muted">
        Ostateczna cena zostanie potwierdzona po diagnozie urządzenia.
      </p>
      {estimate.estimatedTime ? (
        <p className="repair-muted">
          Orientacyjny czas: {estimate.estimatedTime}
        </p>
      ) : null}
      <ul className="repair-summary-list">
        <li>
          <strong>{model}</strong>
        </li>
        {issues.map((id) => (
          <li key={id}>
            {issueLabel(id)}
            {estimate.lines.find((l) => l.service === id)
              ? ` — ${estimate.lines.find((l) => l.service === id)!.label}`
              : ''}
          </li>
        ))}
      </ul>
      <div className="repair-actions">
        <button type="button" className="btn primary" onClick={onContinue}>
          Dalej
        </button>
        <button type="button" className="btn ghost" onClick={onEdit}>
          Popraw usterki
        </button>
      </div>
    </div>
  );
}

function StepDelivery({
  value,
  onSelect,
  onContinue,
  error,
}: {
  value: RepairDeliveryMethod | '';
  onSelect: (v: RepairDeliveryMethod) => void;
  onContinue: () => void;
  error: string | null;
}) {
  return (
    <div>
      <h2>Jak chcesz przekazać telefon?</h2>
      <div className="repair-condition-grid">
        <button
          type="button"
          className={`repair-condition-card${value === 'in_person' ? ' on' : ''}`}
          onClick={() => onSelect('in_person')}
        >
          <strong>🏪 Dostarczę telefon osobiście</strong>
          <span>
            Po wysłaniu zgłoszenia skontaktujemy się z Tobą w celu ustalenia
            terminu.
          </span>
        </button>
        <button
          type="button"
          className={`repair-condition-card${value === 'courier' ? ' on' : ''}`}
          onClick={() => onSelect('courier')}
        >
          <strong>📦 Wyślę telefon kurierem</strong>
          <span>
            Po przyjęciu zgłoszenia otrzymasz instrukcję bezpiecznej wysyłki i
            etykietę zwrotną.
          </span>
        </button>
      </div>
      {value === 'courier' ? (
        <p className="repair-delivery-note">
          Zapakuj iPhone w pudełko z wypełnieniem, wyłącz Find My i wyjmij kartę
          SIM przed nadaniem przesyłki.
        </p>
      ) : null}
      {value === 'in_person' ? (
        <p className="repair-delivery-note">
          Po wysłaniu zgłoszenia skontaktujemy się z Tobą w celu ustalenia
          terminu.
        </p>
      ) : null}
      {error ? (
        <p className="repair-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="repair-actions">
        <button type="button" className="btn primary" onClick={onContinue}>
          Dalej
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
  value: RepairContactForm;
  onChange: (next: RepairContactForm) => void;
  onContinue: () => void;
  error: string | null;
}) {
  const set = <K extends keyof RepairContactForm>(
    key: K,
    v: RepairContactForm[K],
  ) => onChange({ ...value, [key]: v });

  return (
    <div>
      <h2>Podaj dane kontaktowe</h2>
      <div className="repair-form-grid">
        <label className="repair-field">
          <span>Imię</span>
          <input
            required
            value={value.firstName}
            onChange={(e) => set('firstName', e.target.value)}
          />
        </label>
        <label className="repair-field">
          <span>Nazwisko</span>
          <input
            required
            value={value.lastName}
            onChange={(e) => set('lastName', e.target.value)}
          />
        </label>
        <label className="repair-field">
          <span>Numer telefonu</span>
          <input
            type="tel"
            required
            value={value.phone}
            onChange={(e) => set('phone', e.target.value)}
          />
        </label>
        <label className="repair-field">
          <span>E-mail</span>
          <input
            type="email"
            required
            value={value.email}
            onChange={(e) => set('email', e.target.value)}
          />
        </label>
      </div>
      <fieldset className="repair-pref">
        <legend>Preferowana forma kontaktu (opcjonalnie)</legend>
        <div className="repair-seg">
          {(
            [
              { value: 'phone', label: 'Telefon' },
              { value: 'sms', label: 'SMS' },
              { value: 'email', label: 'E-mail' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={value.preferredContact === opt.value ? 'on' : ''}
              onClick={() => set('preferredContact', opt.value as PreferredContact)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="repair-check">
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
        <p className="repair-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="repair-actions">
        <button type="button" className="btn primary" onClick={onContinue}>
          Dalej
        </button>
      </div>
    </div>
  );
}

function StepReview({
  model,
  issues,
  damage,
  phoneTurnsOn,
  deliveryMethod,
  estimateLabel,
  contact,
  submitting,
  error,
  onEdit,
  onSubmit,
}: {
  model: string;
  issues: RepairIssueId[];
  damage: AdditionalDamageId[];
  phoneTurnsOn: YesNoUnknown;
  deliveryMethod: RepairDeliveryMethod;
  estimateLabel: string;
  contact: RepairContactForm;
  submitting: boolean;
  error: string | null;
  onEdit: () => void;
  onSubmit: (e: FormEvent) => void;
}) {
  const powerLabel =
    phoneTurnsOn === 'yes' ? 'Tak' : phoneTurnsOn === 'no' ? 'Nie' : 'Nie wiem';

  return (
    <form onSubmit={onSubmit}>
      <h2>Podsumowanie</h2>
      <p className="repair-kicker">Naprawa iPhone&apos;a</p>
      <div className="repair-review-grid">
        <section>
          <h3>Model</h3>
          <p>{model}</p>
        </section>
        <section>
          <h3>Problem</h3>
          <ul className="repair-summary-list tight">
            {issues.map((id) => (
              <li key={id}>{issueLabel(id)}</li>
            ))}
          </ul>
        </section>
        <section>
          <h3>Dodatkowe uszkodzenia</h3>
          <ul className="repair-summary-list tight">
            {damage.map((id) => (
              <li key={id}>{damageLabel(id)}</li>
            ))}
          </ul>
        </section>
        <section>
          <h3>Telefon się włącza</h3>
          <p>{powerLabel}</p>
        </section>
        <section>
          <h3>Sposób przekazania</h3>
          <p>
            {deliveryMethod === 'courier'
              ? 'Wysyłka kurierem'
              : 'Osobiście'}
          </p>
        </section>
        <section>
          <h3>Szacunkowy koszt</h3>
          <p className="repair-estimate-price sm">{estimateLabel}</p>
        </section>
        <section className="repair-span-2">
          <h3>Dane klienta</h3>
          <ul className="repair-summary-list tight">
            <li>
              {contact.firstName} {contact.lastName}
            </li>
            <li>{contact.phone}</li>
            <li>{contact.email}</li>
          </ul>
        </section>
      </div>
      {error ? (
        <p className="repair-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="repair-actions">
        <button type="button" className="btn ghost" onClick={onEdit}>
          Wróć i popraw
        </button>
        <button type="submit" className="btn primary" disabled={submitting}>
          {submitting ? 'Wysyłanie…' : 'Wyślij zgłoszenie'}
        </button>
      </div>
    </form>
  );
}
