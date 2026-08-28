'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2Icon, SparklesIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { installDefaultChart } from './actions'

export function InstallChartButton() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <Button
      onClick={() =>
        startTransition(async () => {
          const result = await installDefaultChart({})
          if (result.ok) {
            toast.success(`${result.data.created} accounts created.`)
            router.refresh()
          } else {
            toast.error(result.error.message)
          }
        })
      }
      disabled={isPending}
    >
      {isPending ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
      Install the standard chart
    </Button>
  )
}
