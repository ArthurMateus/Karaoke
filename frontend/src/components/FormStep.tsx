import type { ReactNode } from 'react'

/** One numbered part of a longer form (upload, import, redo lyrics). Styles in songs.css. */
export default function FormStep({ n, title, extra, children }: { n?: number; title: ReactNode; extra?: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="upload-step">
      <legend className="upload-step-head">
        {n != null && (
          <span className="step-num" aria-hidden>
            {n}
          </span>
        )}
        {title}
        {extra}
      </legend>
      {children}
    </fieldset>
  )
}
