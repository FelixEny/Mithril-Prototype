import React from 'react'

export function Button({ variant = 'primary', icon, children, onClick, type = 'button', className = '', disabled = false }: {
  variant?: 'primary' | 'secondary' | 'danger'
  icon?: React.ReactNode
  children: React.ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  className?: string
  disabled?: boolean
}) {
  return <button type={type} disabled={disabled} onClick={onClick} className={`btn btn-${variant}${className ? ' ' + className : ''}`}>
    {icon && <span className="btn-icon" aria-hidden="true">{icon}</span>}
    <span>{children}</span>
  </button>
}