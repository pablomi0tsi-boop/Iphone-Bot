import { useEffect, useState, type FormEvent } from 'react';
import { PHONE_CONDITIONS, type PhoneCondition } from '../domain/types';
import { Modal } from './Modal';

interface AddPhoneModalProps {
  open: boolean;
  onClose: () => void;
  models: { id: string; name: string }[];
  presetModelId?: string | null;
  onSubmit: (data: {
    modelId: string;
    purchasePrice: number;
    imei?: string;
    condition: PhoneCondition;
    note?: string;
  }) => void;
}

export function AddPhoneModal({
  open,
  onClose,
  models,
  presetModelId,
  onSubmit,
}: AddPhoneModalProps) {
  const [modelId, setModelId] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [imei, setImei] = useState('');
  const [condition, setCondition] = useState<PhoneCondition>('dobry');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    setModelId(presetModelId ?? models[0]?.id ?? '');
    setPurchasePrice('');
    setImei('');
    setCondition('dobry');
    setNote('');
  }, [open, presetModelId, models]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const price = Number(purchasePrice.replace(',', '.'));
    if (!modelId || !Number.isFinite(price) || price < 0) return;
    onSubmit({
      modelId,
      purchasePrice: price,
      imei: imei.trim() || undefined,
      condition,
      note: note.trim() || undefined,
    });
    onClose();
  };

  return (
    <Modal
      open={open}
      title={presetModelId ? 'Dodaj sztukę (+)' : 'Dodaj telefon'}
      onClose={onClose}
      footer={
        <button type="submit" form="add-phone-form" className="btn primary block">
          Zapisz telefon
        </button>
      }
    >
      <form id="add-phone-form" className="form" onSubmit={handleSubmit}>
        <label>
          Model
          <select
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            required
            disabled={Boolean(presetModelId)}
          >
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Cena zakupu (zł)
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={purchasePrice}
            onChange={(e) => setPurchasePrice(e.target.value)}
            placeholder="np. 1800"
            required
            autoFocus
          />
        </label>
        <label>
          IMEI (opcjonalnie)
          <input
            type="text"
            value={imei}
            onChange={(e) => setImei(e.target.value)}
            placeholder="15 cyfr"
            inputMode="numeric"
          />
        </label>
        <label>
          Stan telefonu
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value as PhoneCondition)}
          >
            {PHONE_CONDITIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Notatka (opcjonalnie)
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="np. bateria 89%, pudełko"
          />
        </label>
      </form>
    </Modal>
  );
}
