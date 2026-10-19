import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

export default function QrCode({ text, label }: { text: string; label: string }) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(text, { margin: 1, width: 240, color: { dark: '#15131a', light: '#ffffff' } })
      .then((url) => !cancelled && setSrc(url))
      .catch(() => !cancelled && setSrc(null))
    return () => {
      cancelled = true
    }
  }, [text])

  return src ? <img className="qr" src={src} alt={label} width={240} height={240} /> : <div className="qr" />
}
