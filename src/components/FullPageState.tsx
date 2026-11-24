import { Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { BrandMark } from './BrandMark'
import { card } from './ui'


/** Centered full-screen state: session check, configuration errors, access denied… */
export function FullPageState(props: { title: string; children?: ReactNode; loading?: boolean; action?: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className={`w-full max-w-md p-6 text-center sm:p-8 ${card}`} role={props.loading ? 'status' : undefined}>
        <BrandMark className="mx-auto size-14" />
        <h1 className="mt-5 flex items-center justify-center gap-2 text-lg font-extrabold tracking-[-0.02em]">
          {props.loading && <Loader2 className="size-5 text-brand motion-safe:animate-spin" aria-hidden />}
          {props.title}
        </h1>
        {props.children && <div className="mt-2 text-sm text-muted">{props.children}</div>}
        {props.action && <div className="mt-6">{props.action}</div>}
      </div>
    </main>
  )
}
