// The app-wide helpers' contexts and hooks (the providers are in Toast.tsx and Dialog.tsx).
import { createContext, useContext } from 'react'

export interface Toasts {
  success: (text: string) => void
  error: (text: string) => void
}
export const ToastContext = createContext<Toasts | null>(null)

/** toast.success('Saved!') / toast.error('...'): a short message that goes away by itself. */
export function useToast(): Toasts {
  const toasts = useContext(ToastContext)
  if (!toasts) throw new Error('useToast needs a <ToastProvider> around the app')
  return toasts
}

export interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel: string
  danger?: boolean
}
export type Confirm = (options: ConfirmOptions) => Promise<boolean>
export const ConfirmContext = createContext<Confirm | null>(null)

/** Replaces window.confirm: `if (await confirm({...})) doIt()`. */
export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext)
  if (!confirm) throw new Error('useConfirm needs a <ConfirmProvider> around the app')
  return confirm
}
