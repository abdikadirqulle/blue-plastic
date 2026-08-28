'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2Icon, LockIcon, UnlockIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { setPeriodStatus } from './actions'

export function PeriodToggle({
  periodId,
  status,
  label,
  canClose,
  canReopen,
}: {
  periodId: string
  status: 'OPEN' | 'CLOSED' | 'LOCKED'
  label: string
  canClose: boolean
  canReopen: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  if (status === 'LOCKED') {
    return <span className="text-xs text-muted-foreground">locked by year-end</span>
  }

  const closing = status === 'OPEN'
  if (closing && !canClose) return null
  if (!closing && !canReopen) return null

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await setPeriodStatus({
            periodId,
            status: closing ? 'CLOSED' : 'OPEN',
          })
          if (result.ok) {
            toast.success(closing ? `${label} closed.` : `${label} reopened.`)
            router.refresh()
          } else {
            toast.error(result.error.message)
          }
        })
      }
    >
      {isPending ? <Loader2Icon className="animate-spin" /> : closing ? <LockIcon /> : <UnlockIcon />}
      {closing ? 'Close' : 'Reopen'}
    </Button>
  )
}
