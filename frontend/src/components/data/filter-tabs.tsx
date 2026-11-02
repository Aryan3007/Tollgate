import { cn } from "@/lib/utils";

interface FilterTabsProps<T> {
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}

/** Underlined tab row used above tables to filter them. */
export function FilterTabs<T>({
  label,
  options,
  value,
  onChange,
}: FilterTabsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex gap-1 overflow-x-auto border-b px-4 sm:px-6"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.label}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "-mb-px border-b-2 px-3 py-3 text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "border-tab-active font-medium text-tab-active"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
