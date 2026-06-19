import { useState, useRef, useEffect } from 'react';

/**
 * A premium searchable select component.
 * @param {Array} options - List of { id, name, subtitle? } objects.
 *   subtitle is shown as a muted secondary line in the dropdown and next to the selected value.
 * @param {string} value - Current selected ID.
 * @param {function} onChange - Callback when selection changes.
 * @param {string} placeholder - Search placeholder.
 * @param {object} style - Custom styles for the container.
 */
export default function SearchableSelect({ options = [], value, onChange, placeholder = 'Search...', style = {} }) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const containerRef = useRef(null);

    const selectedOption = options.find(opt => opt.id === value);

    const filteredOptions = options.filter(opt => {
        const q = searchTerm.toLowerCase();
        return (
            opt.name.toLowerCase().includes(q) ||
            (opt.subtitle && opt.subtitle.toLowerCase().includes(q))
        );
    });

    // Close when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Reset search term when opening
    useEffect(() => {
        if (isOpen) {
            setSearchTerm('');
            setHighlightedIndex(-1);
        }
    }, [isOpen]);

    const handleSelect = (option) => {
        onChange({ target: { value: option.id } });
        setIsOpen(false);
    };

    const handleKeyDown = (e) => {
        if (!isOpen) {
            if (e.key === 'Enter' || e.key === 'ArrowDown') setIsOpen(true);
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIndex(prev => Math.min(prev + 1, filteredOptions.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
                handleSelect(filteredOptions[highlightedIndex]);
            } else if (filteredOptions.length === 1) {
                handleSelect(filteredOptions[0]);
            }
        } else if (e.key === 'Escape') {
            setIsOpen(false);
        }
    };

    return (
        <div className="searchable-select-container" ref={containerRef} style={style} onKeyDown={handleKeyDown}>
            <div className={`searchable-select-display ${isOpen ? 'active' : ''}`} onClick={() => setIsOpen(!isOpen)}>
                <span className="selected-value" style={{ display: 'flex', flexDirection: 'column', gap: 1, lineHeight: 1.2 }}>
                    {selectedOption ? (
                        <>
                            <span>{selectedOption.name}</span>
                            {selectedOption.subtitle && (
                                <span style={{ fontSize: 10, color: 'var(--text-muted, #94a3b8)', fontWeight: 400 }}>
                                    {selectedOption.subtitle}
                                </span>
                            )}
                        </>
                    ) : (
                        <span style={{ color: 'var(--text-muted, #94a3b8)' }}>{placeholder}</span>
                    )}
                </span>
                <span className="dropdown-caret">▼</span>
            </div>

            {isOpen && (
                <div className="searchable-select-dropdown">
                    <div className="searchable-select-search">
                        <input
                            autoFocus
                            placeholder={placeholder}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                    <div className="searchable-select-options">
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map((opt, idx) => (
                                <div
                                    key={opt.id}
                                    className={`searchable-select-option ${opt.id === value ? 'selected' : ''} ${idx === highlightedIndex ? 'highlighted' : ''}`}
                                    onClick={() => handleSelect(opt)}
                                    style={{ display: 'flex', flexDirection: 'column', gap: 1 }}
                                >
                                    <span style={{ fontWeight: 500 }}>{opt.name}</span>
                                    {opt.subtitle && (
                                        <span style={{
                                            fontSize: 10,
                                            color: opt.id === value ? 'rgba(255,255,255,0.75)' : 'var(--text-muted, #94a3b8)',
                                            fontWeight: 400,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 3
                                        }}>
                                            {opt.subtitle}
                                        </span>
                                    )}
                                </div>
                            ))
                        ) : (
                            <div className="searchable-select-option-empty">No matches found</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
