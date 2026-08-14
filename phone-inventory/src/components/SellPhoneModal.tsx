import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { formatPln } from '../domain/calculations';
import { PHONE_CONDITIONS, type Phone } from '../domain/types';
import { Modal } from './Modal';

interface SellPhoneModalProps {
  open: boolean;
  onClose: () => void;
  phones: Phone[];
  modelName: string;
  onSubmit: (data: {
    phoneId: string;
    salePrice: number;
    depositTo: 'cash' | 'bank';
  }) => void;
}

function conditionLabel(value: string): string {
  return PHONE_CONDITIONS.find((item) => item.value === value)?.label ?? value;
}

export function SellPhoneModal({
  open,
  onClose,
  phones,
  modelName,
  onSubmit,
}: SellPhoneModalProps) {
  const sorted = useMemo(
    () =>
      [...phones].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [phones],
  );
  const [phoneId, setPhoneId] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [depositTo, setDepositTo] = useState<'cash' | 'bank'>('cash');

  useEffect(() => {
    if (!open) return;
    setPhoneId(sorted[0]?.id ?? '');
    setSalePrice('');
    setDepositTo('cash');
  }, [open, sorted]);

  const selected = sorted.find((phone) => phone.id === phoneId);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const price = Number(salePrice.replace(',', '.'));
    if (!phoneId || !Number.isFinite(price) || price < 0) return;
    onSubmit({ phoneId, salePrice: price, depositTo });
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
            Wybierz egzemplarz
            <select
              value={phoneId}
              onChange={(e) => setPhoneId(e.target.value)}
              required
            >
              {sorted.map((phone, index) => (
                <option key={phone.id} value={phone.id}>
                  #{index + 1} · zakup {formatPln(phone.purchasePrice)} ·{' '}
                  {conditionLabel(phone.condition)}
                  {phone.imei ? ` · IMEI ${phone.imei}` : ''}
                </option>
              ))}
            </select>
          </label>
          {selected ? (
            <div className="info-box">
              <div>Cena zakupu: <strong>{formatPln(selected.purchasePrice)}</strong></div>
              {selected.note ? <div>Notatka: {selected.note}</div> : null}
            </div>
          ) : null}
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
          {selected && salePrice !== '' && Number.isFinite(Number(salePrice.replace(',', '.'))) ? (
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
