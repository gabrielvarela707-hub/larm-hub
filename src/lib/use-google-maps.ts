'use client'

import { useEffect, useState } from 'react'

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

let globalState: LoadState = 'idle'
const callbacks: Array<() => void> = []

export function useGoogleMaps(apiKey: string) {
  const [state, setState] = useState<LoadState>(globalState)

  useEffect(() => {
    if (globalState === 'ready') {
      setState('ready')
      return
    }
    if (globalState === 'loading') {
      callbacks.push(() => setState('ready'))
      return
    }

    globalState = 'loading'
    setState('loading')

    // Check if already loaded
    if (typeof window !== 'undefined' && window.google?.maps) {
      globalState = 'ready'
      setState('ready')
      callbacks.forEach(cb => cb())
      callbacks.length = 0
      return
    }

    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry,drawing`
    script.async = true
    script.defer = true

    script.onload = () => {
      globalState = 'ready'
      setState('ready')
      callbacks.forEach(cb => cb())
      callbacks.length = 0
    }

    script.onerror = () => {
      globalState = 'error'
      setState('error')
    }

    document.head.appendChild(script)
  }, [apiKey])

  return state
}
