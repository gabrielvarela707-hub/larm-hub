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

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(update)
      resizeObserver.observe(el)
      if (el.firstElementChild) resizeObserver.observe(el.firstElementChild)
    }

    return () => {
      el.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      resizeObserver?.disconnect()
    }
  }, [scrollRef])

  const scrollHorizontally = (direction: 'left' | 'right') => {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({
      left: direction === 'left' ? -Math.abs(step) : Math.abs(step),
      behavior: 'smooth',
    })
  }

  const scrollToTop = () => {
    const tableContainer = scrollRef.current

    // As tabelas mais extensas possuem rolagem vertical própria. Primeiro
    // retorna a listagem para a primeira linha e depois retorna a página.
    tableContainer?.scrollTo({
      top: 0,
      left: tableContainer.scrollLeft,
      behavior: 'smooth',
    })

    let parent = tableContainer?.parentElement ?? null
    while (parent && parent !== document.body) {
      const style = window.getComputedStyle(parent)
      const hasVerticalScroll = /(auto|scroll)/.test(style.overflowY) && parent.scrollHeight > parent.clientHeight
      if (hasVerticalScroll) parent.scrollTo({ top: 0, behavior: 'smooth' })
      parent = parent.parentElement
    }

    document.scrollingElement?.scrollTo({ top: 0, behavior: 'smooth' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className={`fixed bottom-5 right-5 z-40 flex items-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-200/70 ${className}`}>
      <button
        type="button"
        onClick={() => scrollHorizontally('left')}
        disabled={!canScrollLeft}
        title="Mover tabela para a esquerda"
        aria-label="Mover tabela para a esquerda"
        className="flex h-12 w-12 items-center justify-center text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => scrollHorizontally('right')}
        disabled={!canScrollRight}
        title="Mover tabela para a direita"
        aria-label="Mover tabela para a direita"
        className="flex h-12 w-12 items-center justify-center border-l border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
      >
        <ArrowRight className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={scrollToTop}
        title="Voltar ao topo da tabela e da página"
        aria-label="Voltar ao topo da tabela e da página"
        className="flex h-12 w-12 items-center justify-center border-l border-slate-200 text-slate-600 transition hover:bg-slate-50"
      >
        <ArrowUp className="h-4 w-4" />
      </button>
    </div>
  )
}
