import { useEffect, useState } from 'react'

export interface Present<T> {
  item: T
  leaving: boolean
}

/** The list plus, for a moment, the items that just left (marked `leaving`, in their old place),
 * so a list can animate people leaving as well as joining. */
export function usePresence<T>(items: T[], keyOf: (item: T) => string, leaveMs = 280): Present<T>[] {
  const [prev, setPrev] = useState(items)
  const [gone, setGone] = useState<{ item: T; index: number }[]>([])

  // Adjusting state while rendering when the input changes (React's "previous props" pattern).
  if (prev !== items) {
    const keys = new Set(items.map(keyOf))
    const left = prev.flatMap((item, index) => (keys.has(keyOf(item)) ? [] : [{ item, index }]))
    setPrev(items)
    setGone((old) => [...old.filter((g) => !keys.has(keyOf(g.item))), ...left])
  }

  useEffect(() => {
    if (gone.length === 0) return
    const timer = setTimeout(() => setGone([]), leaveMs)
    return () => clearTimeout(timer)
  }, [gone, leaveMs])

  const out: Present<T>[] = items.map((item) => ({ item, leaving: false }))
  for (const g of gone) out.splice(Math.min(g.index, out.length), 0, { item: g.item, leaving: true })
  return out
}
