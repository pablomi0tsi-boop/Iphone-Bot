import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  defaultListedValue,
  storagesForModel,
} from '../domain/catalog';
import { isoToDateInput } from '../domain/calculations';
import {
  PHONE_CONDITIONS,
  type Model,
  type Phone,
  type PhoneCondition,
} from '../domain/types';
import { Modal } from './Modal';

interface PhoneFormFields {
  modelId: string;
  storage: string;
  imei: string;
  batteryPercent: number;
  condition: PhoneCondition;
  note?: string;
  purchasePrice: number;
  listedValue: number;
}

interface PhoneFormModalProps {
  open: boolean;
  mode: 'add' | 'edit';
  models: Model[];
  presetModelId?: string | null;
  phone?: Phone | null;
  onClose: () => void;
  onSubmit: (data: PhoneFormFields) => void;
  onSell?: (data: { salePrice: number; soldAt: string }) => void;
  onDelete?: () => void;
}

export function PhoneFormModal({
  open,
  mode,
  models,
  presetModelId,
  phone,
  onClose,
  onSubmit,
  onSell,
  onDelete,
}: PhoneFormModalProps) {
  const [modelId, setModelId] = useState('');
  const [storage, setStorage] = useState('');
  const [imei, setImei] = useState('');
  const [battery, setBattery] = useState('100');
  const [condition, setCondition] = useState<PhoneCondition>('dobry');
  const [note, setNote] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [listedValue, setListedValue] = useState('');
  const [sellOpen, setSellOpen] = useState(false);
  const [salePrice, setSalePrice] = useState('');
  const [soldAt, setSoldAt] = useState('');

  const selectedModel = models.find((item) => item.id === modelId);
  const storages = useMemo(
    () => (selectedModel ? storagesForModel(selectedModel.name) : []),
    [selectedModel],
  );

  useEffect(() => {
    if (!open) return;
    setSellOpen(false);

    if (mode === 'edit' && phone) {
      setModelId(phone.modelId);
      setStorage(phone.storage);
      setImei(phone.imei);
      setBattery(String(phone.batteryPercent));
      setCondition(phone.condition);
      setNote(phone.note ?? '');
      setPurchasePrice(String(phone.purchasePrice));
      setListedValue(String(phone.listedValue));
      setSalePrice(String(phone.listedValue));
      setSoldAt(isoToDateInput(new Date().toISOString()));
      return;
    }

    const initialModelId = presetModelId ?? models[0]?.id ?? '';
    const model = models.find((item) => item.id === initialModelId);
    const options = model ? storagesForModel(model.name) : [];
    const initialStorage = options[0] ?? '';
    setModelId(initialModelId);
    setStorage(initialStorage);
    setImei('');
    setBattery('100');
    setCondition('dobry');
    setNote('');
    setPurchasePrice('');
    setListedValue(
      model && initialStorage
        ? String(defaultListedValue(model.name, initialStorage) ?? '')
        : '',
    );
  }, [open, mode, phone, presetModelId, models]);

  useEffect(() => {
    if (!open || mode === 'edit') return;
    if (!selectedModel || !storage) return;
    const def = defaultListedValue(selectedModel.name, storage);
    if (typeof def === 'number') setListedValue(String(def));
  }, [selectedModel, storage, open, mode]);

  const handleModelChange = (nextId: string) => {
    setModelId(nextId);
    const model = models.find((item) => item.id === nextId);
    const options = model ? storagesForModel(model.name) : [];
    const nextStorage = options[0] ?? '';
    setStorage(nextStorage);
    if (model && nextStorage) {
      const def = defaultListedValue(model.name, nextStorage);
      if (typeof def === 'number') setListedValue(String(def));
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const purchase = Number(purchasePrice.replace(',', '.'));
    const listed = Number(listedValue.replace(',', '.'));
    const batteryPercent = Number(battery.replace(',', '.'));
    if (!modelId || !storage || !imei.trim()) return;
    if (!Number.isFinite(purchase) || !Number.isFinite(listed)) return;
    if (!Number.isFinite(batteryPercent)) return;
    onSubmit({
      modelId,
      storage,
      imei: imei.trim(),
      batteryPercent,
      condition,
      note: note.trim() || undefined,
      purchasePrice: purchase,
      listedValue: listed,
    });
    onClose();
  };

  const handleSell = (event: FormEvent) => {
    event.preventDefault();
    const price = Number(salePrice.replace(',', '.'));
    if (!onSell || !Number.isFinite(price) || !soldAt) return;
    onSell({ salePrice: price, soldAt });
    onClose();
  };

  return (
    <Modal
      open={open}
      title={mode === 'edit' ? 'Telefon' : 'Dodaj telefon'}
      onClose={onClose}
      footer={
        sellOpen ? (
          <button type="submit" form="sell-unit-form" className="btn primary block">
            Potwierdź sprzedaż
          </button>
        ) : (
          <button type="submit" form="phone-form" className="btn primary block">
            {mode === 'edit' ? 'Zapisz zmiany' : 'DODAJ DO MAGAZYNU'}
          </button>
        )
      }
    >
      {sellOpen ? (
        <form id="sell-unit-form" className="form" onSubmit={handleSell}>
          <label>
            Cena sprzedaży (zł)
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
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
          <button
            type="button"
            className="btn ghost block"
            onClick={() => setSellOpen(false)}
          >
            Anuluj
          </button>
        </form>
      ) : (
        <form id="phone-form" className="form" onSubmit={handleSubmit}>
          <label>
            Model
            <select
              value={modelId}
              onChange={(e) => handleModelChange(e.target.value)}
              required
              disabled={mode === 'edit' || Boolean(presetModelId)}
            >
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Pamięć
            <select
              value={storage}
              onChange={(e) => setStorage(e.target.value)}
              required
            >
              {storages.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
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
              required
            />
          </label>
          <label>
            Kondycja baterii (%)
            <input
              type="number"
              inputMode="numeric"
              min="0"
              max="100"
              step="1"
              value={battery}
              onChange={(e) => setBattery(e.target.value)}
              required
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
            Uwagi
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="opcjonalnie"
            />
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
              required
            />
          </label>
          <label>
            Cena sprzedaży / wartość (zł)
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={listedValue}
              onChange={(e) => setListedValue(e.target.value)}
              required
            />
          </label>

          {mode === 'edit' ? (
            <div className="form-actions">
              {onSell ? (
                <button
                  type="button"
                  className="btn ghost block"
                  onClick={() => setSellOpen(true)}
                >
                  Sprzedaj
                </button>
              ) : null}
              {onDelete ? (
                <button
                  type="button"
                  className="btn danger block"
                  onClick={onDelete}
                >
                  Usuń z magazynu
                </button>
              ) : null}
            </div>
          ) : null}
        </form>
      )}
    </Modal>
  );
}
