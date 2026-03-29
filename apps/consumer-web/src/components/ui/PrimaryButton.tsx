import type { ButtonHTMLAttributes } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement>

export function PrimaryButton({ children, className = '', ...props }: Props) {
  return (
    <button
      className={`
        w-full py-3 px-4 text-xs font-medium tracking-widest uppercase
        bg-[--color-ink] text-[--color-surface]
        transition-opacity duration-150 hover:opacity-70
        disabled:opacity-40 disabled:cursor-not-allowed
        ${className}
      `}
      {...props}
    >
      {children}
    </button>
  )
}
