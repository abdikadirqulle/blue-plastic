export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  // The report tabs are rendered by the shell, which carries the current period
  // across them. See components/layout/module-tabs.tsx.
  return <>{children}</>
}
