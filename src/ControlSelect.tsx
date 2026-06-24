import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type ControlSelectValue = string | number;

type ControlSelectOption<T extends ControlSelectValue> = {
  value: T;
  label: string;
};

type ControlSelectProps<T extends ControlSelectValue> = {
  label: string;
  ariaLabel: string;
  value: T;
  options: ControlSelectOption<T>[];
  onChange: (value: T) => void;
  className?: string;
};

export function ControlSelect<T extends ControlSelectValue>({
  label,
  ariaLabel,
  value,
  options,
  onChange,
  className = "",
}: ControlSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const selectRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const selectedOption = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!isOpen) return;

    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || !selectRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  const selectOption = (nextValue: T) => {
    onChange(nextValue);
    setIsOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <div className={`control-group ${className}`.trim()}>
      <span className="control-group-label">{label}</span>
      <div className="control-select" ref={selectRef}>
        <button
          ref={triggerRef}
          className="control-select-trigger"
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label={ariaLabel}
          title={ariaLabel}
          onClick={() => setIsOpen((open) => !open)}
        >
          <span>{selectedOption?.label ?? ""}</span>
          <ChevronDown className="control-select-chevron" size={15} aria-hidden="true" />
        </button>
        {isOpen ? (
          <div className="control-select-list" role="listbox" aria-label={ariaLabel}>
            {options.map((option) => (
              <button
                key={String(option.value)}
                className={option.value === value ? "active" : ""}
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => selectOption(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
