'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileCheck2Icon, Loader2Icon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { convertEstimate } from '@/app/(app)/sales/actions'

export function ConvertEstimateButton({
  id,
  number,
  today,
}: {
  id: string
  number: string
  today: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <Button
      size="sm"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await convertEstimate({ id, date: today })
          if (result.ok) {
            toast.success(`${number} became invoice ${result.data.number}.`)
            router.push(`/sales/invoices/${result.data.id}`)
            router.refresh()
          } else {
            toast.error(result.error.message)
          }
        })
      }
    >
      {isPending ? <Loader2Icon className="animate-spin" /> : <FileCheck2Icon />}
      Make an invoice
    </Button>
  )
}
