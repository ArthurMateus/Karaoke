import { X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './Button'
import { ConfirmContext, type Confirm, type ConfirmOptions } from './context'
import { cx } from './cx'

/** A dialog over the page (the browser's own <dialog>: it keeps focus inside and closes with Esc). */
export function Modal({ open, onClose, title, children, actions, size = 'sm', returnFocus = 'opener' }: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children?: ReactNode
  actions?: ReactNode
  size?: 'sm' | 'md'
  /** Where focus goes on close: back to the button that opened it, or the page (when that button is about to go). */
  returnFocus?: 'opener' | 'page'
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      opener.current = document.activeElement as HTMLElement | null
      dialog.showModal()
      // showModal() focuses the first button (the X); move to the one marked data-autofocus.
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    }
    if (!open && dialog.open) {
      dialog.close()
      // Back to the button that opened it, or the page if that button is gone or going (e.g. a deleted row).
      const back = returnFocus === 'opener' && opener.current?.isConnected ? opener.current : document.getElementById('main')
      back?.focus()
    }
  }, [open, returnFocus])

  return (
    <dialog
      ref={ref}
      className={cx('modal', size)}
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault() // Esc: let React state close it
        onClose()
      }}
      onClick={(e) => e.target === ref.current && onClose()} // a click on the backdrop
    >
      <div className="modal-body">
        <header className="modal-head">
          <h2 id="modal-title">{title}</h2>
          <button type="button" className="icon-button ghost small" aria-label={t('ui.close')} onClick={onClose}>
            <X size={18} aria-hidden />
          </button>
        </header>
        {children}
        {actions && <footer className="modal-actions">{actions}</footer>}
      </div>
    </dialog>
  )
}

/** Asks "are you sure?" in a dialog: see useConfirm. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [request, setRequest] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null)
  // After "yes" the thing that opened the dialog is often removed (a revoked grant, a deleted song).
  const [confirmed, setConfirmed] = useState(false)

  const confirm = useCallback<Confirm>((options) => new Promise((resolve) => setRequest({ ...options, resolve })), [])
  const answer = (ok: boolean) => {
    request?.resolve(ok)
    setConfirmed(ok)
    setRequest(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={!!request}
        onClose={() => answer(false)}
        returnFocus={confirmed ? 'page' : 'opener'}
        title={request?.title ?? ''}
        actions={
          <>
            {/* Dangerous actions start on Cancel, so an accidental Enter doesn't delete anything. */}
            <Button variant="ghost" onClick={() => answer(false)} data-autofocus={request?.danger || undefined}>
              {t('ui.cancel')}
            </Button>
            <Button variant={request?.danger ? 'danger' : 'primary'} onClick={() => answer(true)} data-autofocus={!request?.danger || undefined}>
              {request?.confirmLabel}
            </Button>
          </>
        }
      >
        {request?.message && <p className="muted">{request.message}</p>}
      </Modal>
    </ConfirmContext.Provider>
  )
}
