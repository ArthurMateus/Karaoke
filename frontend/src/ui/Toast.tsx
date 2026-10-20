import { CircleAlert, CircleCheck, X } from 'lucide-react'
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ToastContext, type Toasts } from './context'
import { cx } from './cx'

type Kind = 'success' | 'error'
interface Item {
  id: number
  kind: Kind
  text: string
}
const SHOW_MS = 3800

/** Short messages that pop up at the bottom ("Saved!", "Copied!") and go away by themselves. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [items, setItems] = useState<Item[]>([])
  const nextId = useRef(1)

  const remove = useCallback((id: number) => setItems((list) => list.filter((i) => i.id !== id)), [])
  const add = useCallback(
    (kind: Kind, text: string) => {
      const id = nextId.current++
      setItems((list) => [...list.filter((i) => i.text !== text), { id, kind, text }].slice(-3))
      setTimeout(() => remove(id), SHOW_MS)
    },
    [remove],
  )
  const api = useMemo<Toasts>(() => ({ success: (text) => add('success', text), error: (text) => add('error', text) }), [add])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((item) => {
          const Icon = item.kind === 'success' ? CircleCheck : CircleAlert
          return (
            <div key={item.id} className={cx('toast', item.kind)}>
              <Icon size={18} aria-hidden />
              <span>{item.text}</span>
              <button type="button" className="toast-close" aria-label={t('ui.dismiss')} onClick={() => remove(item.id)}>
                <X size={16} aria-hidden />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
