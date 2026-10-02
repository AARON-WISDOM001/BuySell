'use client';

type SortOption = {
  value: string;
  label: string;
};

export function CatalogSort({
  options,
  value,
}: {
  options: readonly SortOption[];
  value: string;
}) {
  return (
    <select
      id="sort"
      name="sort"
      defaultValue={value}
      onChange={(event) => event.currentTarget.form?.requestSubmit()}
      className="h-8 rounded-xs border border-line bg-surface px-2 text-[13px] transition-colors"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}