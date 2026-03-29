import type { ButtonHTMLAttributes } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement>

export function PrimaryButton({ children, className = '', ...props }: Props) {
  return (
    <button
      className={`py-2.5 px-5 text-sm font-semibold rounded-lg bg-blue-600 text-white transition-colors duration-150 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
