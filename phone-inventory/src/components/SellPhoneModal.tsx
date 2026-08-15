import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  formatPln,
  isoToDateInput,
} from '../domain/calculations';
import {
  PHONE_CONDITIONS,
  STORAGE_OPTIONS,
  type Phone,
} from '../domain/types';
import { Modal } from './Modal';

interface SellPhoneModalProps {
  open: boolean;
  onClose: () => void;
  phones: Phone[];
  modelName: string;
  onSubmit: (data: {
    phoneId: string;
    salePrice: number;
    soldAt: string;
    storage?: string;
    imei?: string;
    depositTo: 'cash' | 'bank';
  }) => void;
}

function conditionLabel(value: string): string {
  return PHONE_CONDITIONS.find((item) => item.value === value)?.label ?? value;
}

function applyPhoneDefaults(
  phone: Phone | undefined,
  setters: {
    setStorage: (value: string) => void;
    setImei: (value: string) => void;
  },
) {
  setters.setStorage(phone?.storage ?? '128 GB');
  setters.setImei(phone?.imei ?? '');
}

export function SellPhoneModal({
  open,
  onClose,
  phones,
  modelName,
  onSubmit,
}: SellPhoneModalProps) {
  const sorted = useMemo(
    () => [...phones].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [phones],
  );
  const [phoneId, setPhoneId] = useState('');
  const [storage, setStorage] = useState('128 GB');
  const [imei, setImei] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [soldAt, setSoldAt] = useState('');
  const [depositTo, setDepositTo] = useState<'cash' | 'bank'>('cash');

  useEffect(() => {
    if (!open) return;
    const first = sorted[0];
    setPhoneId(first?.id ?? '');
    applyPhoneDefaults(first, { setStorage, setImei });
    setSalePrice('');
    setSoldAt(isoToDateInput(new Date().toISOString()));
    setDepositTo('cash');
  }, [open, sorted]);

  const selected = sorted.find((phone) => phone.id === phoneId);

  const handlePhoneChange = (nextId: string) => {
    setPhoneId(nextId);
    const phone = sorted.find((item) => item.id === nextId);
    applyPhoneDefaults(phone, { setStorage, setImei });
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const price = Number(salePrice.replace(',', '.'));
    if (!phoneId || !Number.isFinite(price) || price < 0 || !soldAt) return;
    onSubmit({
      phoneId,
      salePrice: price,
      soldAt,
      storage: storage.trim() || undefined,
      imei: imei.trim() || undefined,
      depositTo,
    });
    onClose();
  };

  return (
    <Modal
      open={open}
      title={`Sprzedaj — ${modelName}`}
      onClose={onClose}
      footer={
        <button
          type="submit"
          form="sell-phone-form"
          className="btn primary block"
          disabled={sorted.length === 0}
        >
          Potwierdź sprzedaż
        </button>
      }
    >
      {sorted.length === 0 ? (
        <p className="empty-hint">Brak telefonów tego modelu.</p>
      ) : (
        <form id="sell-phone-form" className="form" onSubmit={handleSubmit}>
          <label>
            Model
            <input type="text" value={modelName} readOnly />
          </label>
          <label>
            Egzemplarz z magazynu
            <select
              value={phoneId}
              onChange={(e) => handlePhoneChange(e.target.value)}
              required
            >
              {sorted.map((phone, index) => (
                <option key={phone.id} value={phone.id}>
                  #{index + 1} · zakup {formatPln(phone.purchasePrice)} ·{' '}
                  {conditionLabel(phone.condition)}
                  {phone.storage ? ` · ${phone.storage}` : ''}
                  {phone.imei ? ` · IMEI ${phone.imei}` : ''}
                </option>
              ))}
            </select>
          </label>
          {selected ? (
            <div className="info-box">
              <div>
                Cena zakupu: <strong>{formatPln(selected.purchasePrice)}</strong>
              </div>
              {selected.note ? <div>Notatka: {selected.note}</div> : null}
            </div>
          ) : null}
          <label>
            Pamięć
            <select
              value={storage}
              onChange={(e) => setStorage(e.target.value)}
              required
            >
              {STORAGE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
              {storage &&
              !(STORAGE_OPTIONS as readonly string[]).includes(storage) ? (
                <option value={storage}>{storage}</option>
              ) : null}
            </select>
          </label>
          <label>
            IMEI
            <input
              type="text"
              value={imei}
              onChange={(e) => setImei(e.target.value)}
              placeholder="15 cyfr"
              inputMode="numeric"
            />
          </label>
          <label>
            Cena sprzedaży (zł)
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
              placeholder="np. 2200"
              required
              autoFocus
            />
          </label>
          <label>
            Data sprzedaży
            <input
              type="date"
              value={soldAt}
              onChange={(e) => setSoldAt(e.target.value)}
              required
            />
          </label>
          {selected &&
          salePrice !== '' &&
          Number.isFinite(Number(salePrice.replace(',', '.'))) ? (
            <div
              className={`info-box ${
                Number(salePrice.replace(',', '.')) - selected.purchasePrice >= 0
                  ? 'positive'
                  : 'negative'
              }`}
            >
              Zysk:{' '}
              <strong>
                {formatPln(
                  Number(salePrice.replace(',', '.')) - selected.purchasePrice,
                )}
              </strong>
            </div>
          ) : null}
          <label>
            Wpływy na
            <select
              value={depositTo}
              onChange={(e) => setDepositTo(e.target.value as 'cash' | 'bank')}
            >
              <option value="cash">Gotówka</option>
              <option value="bank">Konto</option>
            </select>
          </label>
        </form>
      )}
    </Modal>
  );
}
