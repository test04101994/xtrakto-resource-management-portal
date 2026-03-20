import { useState, useRef, useEffect } from 'react';

export default function SearchableSelect({ label, value, onChange, options, placeholder = 'Search...', required = false }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef();

  // Close on click outside
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = options.find(o => o.value === value);
  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));

  return (
    <label>
      {label}
      <div className="searchable-select" ref={ref}>
        <div
          className={`searchable-select-trigger${open ? ' open' : ''}`}
          onClick={() => setOpen(!open)}
        >
          {selected ? selected.label : <span className="text-muted">{placeholder}</span>}
        </div>
        {/* Hidden native select for form required validation */}
        {required && (
          <select
            required
            value={value}
            onChange={() => {}}
            style={{ position: 'absolute', opacity: 0, height: 0, width: 0, pointerEvents: 'none' }}
            tabIndex={-1}
          >
            <option value=""></option>
            {value && <option value={value}>{value}</option>}
          </select>
        )}
        {open && (
          <div className="searchable-select-dropdown">
            <input
              type="text"
              className="searchable-select-search"
              placeholder="Type to search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
              onClick={e => e.stopPropagation()}
            />
            <div className="searchable-select-options">
              <div
                className={`searchable-select-option${!value ? ' selected' : ''}`}
                onClick={() => { onChange(''); setOpen(false); setSearch(''); }}
              >
                {placeholder}
              </div>
              {filtered.length === 0 && (
                <div className="searchable-select-option disabled">No results found</div>
              )}
              {filtered.map(o => (
                <div
                  key={o.value}
                  className={`searchable-select-option${o.value === value ? ' selected' : ''}`}
                  onClick={() => { onChange(o.value); setOpen(false); setSearch(''); }}
                >
                  {o.label}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </label>
  );
}
