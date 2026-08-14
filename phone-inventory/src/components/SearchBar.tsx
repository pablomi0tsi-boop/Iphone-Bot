interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchBar({
  value,
  onChange,
  placeholder = 'Szukaj modelu, np. 15 Pro',
}: SearchBarProps) {
  return (
    <div className="search-bar">
      <span className="search-icon" aria-hidden>
        🔍
      </span>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
      {value ? (
        <button
          type="button"
          className="clear-btn"
          onClick={() => onChange('')}
          aria-label="Wyczyść"
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}
