import { requireOrgContext } from '@/server/auth/context'

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  // The section tabs are rendered by the shell, from the same module list the
  // sidebar reads. This layout is the permission gate, the width, and the one
  // heading the settings pages share.
  await requireOrgContext('org:read')

  return (
    <div className="mx-auto w-full max-w-4xl">
      <h1 className="mb-6 text-xl font-semibold tracking-tight">Settings</h1>
      {children}
    </div>
  )
}
