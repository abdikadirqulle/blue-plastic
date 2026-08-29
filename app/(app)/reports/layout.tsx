import { Suspense } from 'react'

import { ReportsNav } from './reports-nav'

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={<div className="mb-4 h-10 border-b" />}>
        <ReportsNav />
      </Suspense>
      {children}
    </>
  )
}
