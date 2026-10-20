import { Check, X, type LucideIcon } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { fitsAccept } from '../lib/files'
import { IconButton, cx } from '../ui'

/**
 * A file picker you can also drop a file on. The real <input type="file"> covers the whole box
 * (invisible), so clicking, dropping, keyboard focus and the form's `required` check all work as usual.
 * Once a file is chosen, the box shows its name and `details` (size, length...).
 */
export default function FileDrop({ id, title, hint, accept, icon: Icon, file, onFile, details, required }: {
  id: string
  title: string // "Audio file"
  hint: ReactNode // formats and limits
  accept: string
  icon: LucideIcon
  file: File | null
  onFile: (file: File | null) => void
  details?: ReactNode // shown under the chosen file's name
  required?: boolean
}) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [wrongType, setWrongType] = useState(false)

  const clear = () => {
    if (input.current) input.current.value = ''
    onFile(null)
  }

  return (
    <div className="stack tight">
      <div
        className={cx('file-drop', over && 'over', file && 'chosen')}
        onDragEnter={() => setOver(true)}
        onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setOver(false)}
        onDrop={() => setOver(false)}
      >
        {file ? (
          <div className="file-chosen">
            <span className="file-drop-icon" aria-hidden>
              <Check size={22} />
            </span>
            <div className="file-chosen-main">
              <strong className="file-chosen-name">{file.name}</strong>
              <span className="file-chosen-meta">{details}</span>
              <span className="muted small">{t('upload.dropChange')}</span>
            </div>
          </div>
        ) : (
          <>
            <span className="file-drop-icon" aria-hidden>
              <Icon size={24} />
            </span>
            <strong>{over ? t('upload.dropHere') : title}</strong>
            <span className="muted small">{t('upload.dropOrClick')}</span>
            <span className="muted small">{hint}</span>
          </>
        )}
        <input
          ref={input}
          id={id}
          className="file-input"
          type="file"
          accept={accept}
          required={required}
          aria-label={file ? `${title}: ${file.name}` : title}
          onChange={(e) => {
            const chosen = e.target.files?.[0] ?? null
            // A dropped file skips the picker's own type filter: check it here.
            if (chosen && !fitsAccept(chosen, accept)) {
              setWrongType(true)
              clear()
              return
            }
            setWrongType(false)
            onFile(chosen)
          }}
        />
        {file && <IconButton icon={X} size="sm" className="file-remove" label={t('upload.removeFile', { name: file.name })} onClick={clear} />}
      </div>
      {wrongType && (
        <p className="error small" role="alert">
          {t('upload.wrongType')}
        </p>
      )}
    </div>
  )
}
