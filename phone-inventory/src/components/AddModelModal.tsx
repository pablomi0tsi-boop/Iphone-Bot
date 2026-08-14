import { useEffect, useState, type FormEvent } from 'react';
import { Modal } from './Modal';

interface AddModelModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
}

export function AddModelModal({ open, onClose, onSubmit }: AddModelModalProps) {
  const [name, setName] = useState('');

  useEffect(() => {
    if (open) setName('');
  }, [open]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    onClose();
  };

  return (
    <Modal
      open={open}
      title="Dodaj model"
      onClose={onClose}
      footer={
        <button type="submit" form="add-model-form" className="btn primary block">
          Dodaj
        </button>
      }
    >
      <form id="add-model-form" className="form" onSubmit={handleSubmit}>
        <label>
          Nazwa modelu
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="np. iPhone 16 Pro"
            required
            autoFocus
          />
        </label>
      </form>
    </Modal>
  );
}
