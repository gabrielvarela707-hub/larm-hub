'use client'

import { ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react'
import { useEffect, useState, type RefObject } from 'react'

type Props = {
  scrollRef: RefObject<HTMLDivElement | null>
  step?: number
  className?: string
}

export default function TableFloatingNav({ scrollRef, step = 420, className = '' }: Props) {
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const update = () => {
      const maxLeft = Math.max(0, el.scrollWidth - el.clientWidth)
      setCanScrollLeft(el.scrollLeft > 4)
      setCanScrollRight(el.scrollLeft < maxLeft - 4)
    }

    update()

    el.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)

    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(update)
      ro.observe(el)
    }

    return () => {
      el.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      ro?.disconnect()
    }
  }, [scrollRef])

  const scrollHorizontally = (direction: 'left' | 'right') => {
    const el = scrollRef.current
    if (!el) return
    const amount = direction === 'left' ? -Math.abs(step) : Math.abs(step)
    el.scrollBy({ left: amount, behavior: 'smooth' })
  }

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className={`fixed bottom-5 right-5 z-30 flex items-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-200/70 ${className}`}>
      <button
        type="button"
        onClick={() => scrollHorizontally('left')}
        disabled={!canScrollLeft}
        title="Mover tabela para a esquerda"
        className="flex h-12 w-12 items-center justify-center text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => scrollHorizontally('right')}
        disabled={!canScrollRight}
        title="Mover tabela para a direita"
        className="flex h-12 w-12 items-center justify-center border-l border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
      >
        <ArrowRight className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={scrollToTop}
        title="Voltar ao topo"
        className="flex h-12 w-12 items-center justify-center border-l border-slate-200 text-slate-600 transition hover:bg-slate-50"
      >
        <ArrowUp className="h-4 w-4" />
      </button>
    </div>
  )
}
