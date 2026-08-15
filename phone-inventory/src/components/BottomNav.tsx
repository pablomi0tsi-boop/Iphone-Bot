export type TabId = 'magazyn' | 'zysk';

interface BottomNavProps {
  active: TabId;
  onChange: (tab: TabId) => void;
}

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'magazyn', label: 'Magazyn', icon: '📱' },
  { id: 'zysk', label: 'Zysk', icon: '📈' },
];

export function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="Nawigacja">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={active === tab.id ? 'active' : ''}
          onClick={() => onChange(tab.id)}
        >
          <span className="nav-icon" aria-hidden>
            {tab.icon}
          </span>
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
