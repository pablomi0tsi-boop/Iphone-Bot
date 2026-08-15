import { useEffect, useState, type FormEvent } from 'react';
import { Modal } from './Modal';

interface EditFinanceModalProps {
  open: boolean;
  title: string;
  label: string;
  value: number;
  onClose: () => void;
  onSubmit: (value: number) => void;
}

export function EditFinanceModal({
  open,
  title,
  label,
  value,
  onClose,
  onSubmit,
}: EditFinanceModalProps) {
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (open) setAmount(String(value));
  }, [open, value]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = Number(amount.replace(',', '.'));
    if (!Number.isFinite(parsed)) return;
    onSubmit(parsed);
    onClose();
  };

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <button type="submit" form="edit-finance-form" className="btn primary block">
          Zapisz
        </button>
      }
    >
      <form id="edit-finance-form" className="form" onSubmit={handleSubmit}>
        <label>
          {label}
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            autoFocus
          />
        </label>
      </form>
    </Modal>
  );
}
