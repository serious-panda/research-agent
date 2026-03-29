import type { ButtonHTMLAttributes } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement>

export function SecondaryButton({ children, className = '', ...props }: Props) {
  return (
    <button
      className={`py-2.5 px-5 text-sm font-semibold rounded-lg bg-white text-blue-600 border border-slate-200 transition-colors duration-150 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
