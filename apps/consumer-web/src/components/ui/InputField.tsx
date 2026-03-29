import type { InputHTMLAttributes } from 'react'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
}

export function InputField({ label, error, id, ...inputProps }: Props) {
  const fieldId = id ?? label.toLowerCase().replace(/\s+/g, '-')

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={fieldId}
        className="text-xs font-medium tracking-widest uppercase text-[--color-muted]"
      >
        {label}
      </label>
      <input
        id={fieldId}
        className="
          border-0 border-b border-[--color-border] bg-transparent
          py-2.5 text-sm text-[--color-ink] placeholder:text-[--color-muted]
          outline-none transition-colors duration-150
          focus:border-[--color-accent]
          disabled:opacity-40 disabled:cursor-not-allowed
        "
        {...inputProps}
      />
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
    </div>
  )
}
