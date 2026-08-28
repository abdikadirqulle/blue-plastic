import { SettingsNav } from './settings-nav'
import { requireOrgContext } from '@/server/auth/context'

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireOrgContext('org:read')

  const tabs = [
    { href: '/settings/organization', label: 'Organisation', show: true },
    { href: '/settings/payment-terms', label: 'Payment terms', show: true },
    { href: '/settings/tax', label: 'Tax', show: ctx.permissions.has('tax:read') },
    { href: '/settings/users', label: 'Users', show: ctx.permissions.has('user:read') },
    { href: '/settings/profile', label: 'Your profile', show: true },
    { href: '/settings/activity', label: 'Activity log', show: ctx.permissions.has('audit:read') },
  ].filter((tab) => tab.show)

  return (
    <div className="mx-auto w-full max-w-4xl">
      <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
      <SettingsNav tabs={tabs.map(({ href, label }) => ({ href, label }))} />
      {children}
    </div>
  )
}
