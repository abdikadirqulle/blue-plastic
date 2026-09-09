import Link from 'next/link'
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  Factory,
  Mail,
  MapPin,
  PackageCheck,
  Phone,
  Recycle,
  Ruler,
  ShieldCheck,
  Truck,
} from 'lucide-react'

/**
 * The public front of the business.
 *
 * Deliberately styled outside the application's design system. The app is dense
 * on purpose — 13px text, 4px corners, one quiet accent — because it is looked
 * at for seven hours a day. A first-time visitor gets the opposite treatment:
 * large type, generous space, and the company's blue used at full strength. So
 * every colour, radius and size here is explicit rather than a token, and
 * nothing on this page can drift when the application's palette changes.
 */

const CATEGORIES = [
  {
    icon: Boxes,
    name: 'Household & kitchenware',
    body: 'Storage boxes, basins, buckets, crates and racks in food-safe grades.',
  },
  {
    icon: PackageCheck,
    name: 'Packaging & containers',
    body: 'Jerrycans, drums, jars, closures and preforms from 50 ml to 220 L.',
  },
  {
    icon: Ruler,
    name: 'Pipes & fittings',
    body: 'PVC and HDPE pressure pipe, conduit, couplings and valves to spec.',
  },
  {
    icon: Factory,
    name: 'Industrial & agricultural',
    body: 'Pallets, tanks, sheeting, liners and mulch film for site and field.',
  },
  {
    icon: Recycle,
    name: 'Raw material & granules',
    body: 'Virgin and recycled HDPE, LDPE, PP, PVC and PET by the bag or tonne.',
  },
  {
    icon: Truck,
    name: 'Bulk & contract supply',
    body: 'Standing orders, scheduled replenishment and single-invoice delivery.',
  },
] as const

const PROMISES = [
  {
    icon: PackageCheck,
    title: 'Held in stock, not ordered in',
    body: 'The lines you buy weekly sit on our floor. You are quoted from inventory, so a confirmed order is a confirmed date — not a lead time we hope to meet.',
  },
  {
    icon: ShieldCheck,
    title: 'Graded and traceable',
    body: 'Every batch carries its grade and origin. Food-contact stock stays segregated from industrial, and what we cannot certify we do not sell.',
  },
  {
    icon: Truck,
    title: 'One supplier, one invoice',
    body: 'Household, packaging and pipe on the same delivery and the same statement. Fewer suppliers to chase, and one account to reconcile at month end.',
  },
] as const

const MATERIALS = ['HDPE', 'PP', 'PVC', 'PET', 'LDPE', 'PS'] as const

export function Landing({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="min-h-screen bg-white text-[15px] leading-relaxed text-slate-700">
      <SiteHeader signedIn={signedIn} />
      <main>
        <Hero />
        <Categories />
        <Promises />
        <Contact />
      </main>
      <SiteFooter />
    </div>
  )
}

function Wordmark({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  const ink = tone === 'light' ? 'text-white' : 'text-slate-900'
  const sub = tone === 'light' ? 'text-blue-200/70' : 'text-slate-500'

  return (
    <Link href="/" className="group flex items-center gap-2.5">
      <span className="grid size-9 place-items-center rounded-[10px] bg-gradient-to-br from-blue-500 to-blue-700 shadow-[0_6px_16px_-6px_rgb(37_99_235/0.7)]">
        <span className="text-[15px] font-bold leading-none text-white">B</span>
      </span>
      <span className="leading-tight">
        <span className={`block text-[15px] font-semibold tracking-tight ${ink}`}>Blue Plastic Center</span>
        <span className={`hidden text-[11px] font-medium uppercase tracking-[0.14em] sm:block ${sub}`}>
          Plastics supply &amp; distribution
        </span>
      </span>
    </Link>
  )
}

function SiteHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-900/5 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-5 sm:px-8">
        <Wordmark />

        <nav className="hidden items-center gap-8 text-[14px] font-medium text-slate-600 md:flex">
          <a className="transition-colors hover:text-slate-900" href="#products">
            Products
          </a>
          <a className="transition-colors hover:text-slate-900" href="#why">
            Why us
          </a>
          <a className="transition-colors hover:text-slate-900" href="#contact">
            Contact
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <a
            className="hidden h-10 items-center rounded-[10px] px-4 text-[14px] font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 sm:inline-flex"
            href="#contact"
          >
            Request a quote
          </a>
          <Link
            className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-slate-900 px-4 text-[14px] font-medium text-white transition-colors hover:bg-slate-800"
            href={signedIn ? '/dashboard' : '/sign-in'}
          >
            {signedIn ? 'Open dashboard' : 'Staff sign in'}
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </header>
  )
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-slate-950">
      {/* The light in the room: one warm-blue source top-right, a cooler fill
          bottom-left, and a faint grid so the dark panel has a surface rather
          than being a flat black rectangle. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_100%_at_82%_-10%,rgb(37_99_235/0.55),transparent_58%),radial-gradient(90%_80%_at_5%_110%,rgb(14_165_233/0.28),transparent_60%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.18] [background-image:linear-gradient(to_right,rgb(255_255_255/0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.14)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:radial-gradient(80%_70%_at_50%_20%,black,transparent)]"
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-24">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] font-medium tracking-wide text-blue-100 backdrop-blur">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            Wholesale, retail and contract supply
          </span>

          <h1 className="mt-6 text-[2.25rem] font-semibold leading-[1.08] tracking-[-0.03em] text-white sm:text-[2.75rem] lg:text-[3.25rem]">
            The plastics your work runs on —{' '}
            <span className="bg-gradient-to-r from-blue-300 via-sky-300 to-blue-400 bg-clip-text text-transparent">
              in stock, in spec, on time.
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-[17px] leading-[1.65] text-slate-300">
            Blue Plastic Center supplies household, packaging, pipe and industrial plastics to
            retailers, fabricators, farms and contractors. One supplier, one delivery, one invoice
            at the end of the month.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              className="inline-flex h-12 items-center justify-center gap-2 rounded-[12px] bg-blue-600 px-6 text-[15px] font-semibold text-white shadow-[0_10px_30px_-10px_rgb(37_99_235/0.9)] transition-colors hover:bg-blue-500"
              href="#contact"
            >
              Request a quote
              <ArrowRight className="size-4" />
            </a>
            <a
              className="inline-flex h-12 items-center justify-center rounded-[12px] border border-white/15 bg-white/5 px-6 text-[15px] font-medium text-white backdrop-blur transition-colors hover:bg-white/10"
              href="#products"
            >
              Browse what we stock
            </a>
          </div>

          <dl className="mt-10 grid max-w-lg grid-cols-3 gap-6 border-t border-white/10 pt-6">
            {[
              ['Stocked lines', 'Ready to load'],
              ['Delivery', 'Own fleet'],
              ['Accounts', 'Credit terms'],
            ].map(([term, detail]) => (
              <div key={term}>
                <dt className="text-[12px] uppercase tracking-[0.12em] text-slate-400">{term}</dt>
                <dd className="mt-1.5 text-[15px] font-semibold text-white">{detail}</dd>
              </div>
            ))}
          </dl>
        </div>

        <HeroVisual />
      </div>

      {/* The dark hero ends on the white page, not against it. */}
      <div aria-hidden className="relative h-px w-full bg-gradient-to-r from-transparent via-white/20 to-transparent" />
    </section>
  )
}

/**
 * A photograph would be better, and there is no photograph. So the visual is a
 * built one: the material grades stacked as glass tiles over the hero's own
 * light, which says "we hold stock in these grades" without pretending to be a
 * picture of a warehouse.
 */
function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none">
      <div aria-hidden className="absolute -inset-6 rounded-[36px] bg-blue-500/20 blur-3xl" />

      <div className="relative rounded-[24px] border border-white/12 bg-white/[0.06] p-5 backdrop-blur-xl">
        <div className="flex items-center justify-between px-1 pb-4">
          <span className="text-[12px] font-medium uppercase tracking-[0.14em] text-blue-200/80">
            Grades held
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/12 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            In stock
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {MATERIALS.map((code, i) => (
            <div
              key={code}
              className="group relative overflow-hidden rounded-[16px] border border-white/10 bg-gradient-to-br from-white/[0.14] to-white/[0.04] p-4"
            >
              <div
                aria-hidden
                className="absolute -right-6 -top-6 size-16 rounded-full bg-blue-400/25 blur-xl"
                style={{ opacity: 0.35 + (i % 3) * 0.22 }}
              />
              <span className="relative block text-[19px] font-semibold tracking-tight text-white">
                {code}
              </span>
              <span className="relative mt-0.5 block text-[11px] text-slate-400">
                {i % 2 === 0 ? 'virgin · recycled' : 'natural · coloured'}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-2.5 rounded-[16px] border border-white/10 bg-slate-950/40 p-4">
          {[
            'Cut, bagged or palletised to your order',
            'Sample before you commit to a run',
            'Collection or delivery, same week',
          ].map((line) => (
            <p key={line} className="flex items-start gap-2.5 text-[13.5px] text-slate-300">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-blue-400" />
              {line}
            </p>
          ))}
        </div>
      </div>
    </div>
  )
}

function SectionHeading({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string
  title: string
  body: string
}) {
  return (
    <div className="max-w-2xl">
      <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-blue-600">
        {eyebrow}
      </span>
      <h2 className="mt-3 text-[2rem] font-semibold leading-tight tracking-[-0.02em] text-slate-900 sm:text-[2.5rem]">
        {title}
      </h2>
      <p className="mt-4 text-[16.5px] leading-[1.65] text-slate-600">{body}</p>
    </div>
  )
}

function Categories() {
  return (
    <section id="products" className="scroll-mt-20 border-b border-slate-100 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHeading
          eyebrow="What we stock"
          title="Six aisles, one delivery note."
          body="From a crate of buckets for a shop shelf to a tonne of granule for a moulding line — the range is deliberately wide so a customer does not need a second supplier for the small half of the order."
        />

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map(({ icon: Icon, name, body }) => (
            <div
              key={name}
              className="group rounded-[16px] border border-slate-200 bg-white p-6 transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_18px_40px_-24px_rgb(15_23_42/0.35)]"
            >
              <span className="grid size-11 place-items-center rounded-[12px] bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-600 group-hover:text-white">
                <Icon className="size-5" />
              </span>
              <h3 className="mt-5 text-[16.5px] font-semibold tracking-tight text-slate-900">{name}</h3>
              <p className="mt-2 text-[14.5px] leading-[1.6] text-slate-600">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Promises() {
  return (
    <section id="why" className="scroll-mt-20 bg-slate-50 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHeading
          eyebrow="Why buy here"
          title="A supplier is a promise about next Tuesday."
          body="Price is the easy part. What a workshop or a shop actually buys is certainty — that the stock exists, that it is the grade it says it is, and that it arrives when it was promised."
        />

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {PROMISES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-[18px] border border-slate-200 bg-white p-7">
              <span className="grid size-11 place-items-center rounded-[12px] bg-slate-900 text-white">
                <Icon className="size-5" />
              </span>
              <h3 className="mt-5 text-[17px] font-semibold tracking-tight text-slate-900">{title}</h3>
              <p className="mt-2.5 text-[14.5px] leading-[1.65] text-slate-600">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Contact() {
  return (
    <section id="contact" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="relative overflow-hidden rounded-[24px] bg-slate-950 px-7 py-14 sm:px-14">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(100%_120%_at_90%_0%,rgb(37_99_235/0.5),transparent_60%)]"
          />
          <div className="relative grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <h2 className="text-[2rem] font-semibold leading-tight tracking-[-0.02em] text-white sm:text-[2.5rem]">
                Send us the list. We&rsquo;ll price it today.
              </h2>
              <p className="mt-4 max-w-lg text-[16.5px] leading-[1.65] text-slate-300">
                Quantities, grades, sizes — however rough. If we hold it you get a price and a
                collection date; if we do not, we say so rather than quoting a date we cannot keep.
              </p>
              <a
                className="mt-8 inline-flex h-12 items-center gap-2 rounded-[12px] bg-blue-600 px-6 text-[15px] font-semibold text-white shadow-[0_10px_30px_-10px_rgb(37_99_235/0.9)] transition-colors hover:bg-blue-500"
                href="mailto:sales@blueplasticcenter.com?subject=Quote%20request"
              >
                Email a quote request
                <ArrowRight className="size-4" />
              </a>
            </div>

            <dl className="space-y-5 border-t border-white/10 pt-8 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-0">
              {[
                { icon: Mail, term: 'Sales', detail: 'sales@blueplasticcenter.com' },
                { icon: Phone, term: 'Trade counter', detail: '+1 (000) 000-0000' },
                { icon: MapPin, term: 'Warehouse', detail: 'Mon–Sat, 08:00–18:00' },
              ].map(({ icon: Icon, term, detail }) => (
                <div key={term} className="flex items-start gap-3.5">
                  <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-[10px] border border-white/12 bg-white/5 text-blue-300">
                    <Icon className="size-4" />
                  </span>
                  <div>
                    <dt className="text-[12px] uppercase tracking-[0.12em] text-slate-400">{term}</dt>
                    <dd className="mt-0.5 text-[15px] font-medium text-white">{detail}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </section>
  )
}

function SiteFooter() {
  return (
    <footer className="border-t border-slate-100 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-5 sm:px-8 md:flex-row md:items-center">
        <Wordmark />
        <div className="flex flex-wrap items-center gap-x-7 gap-y-2 text-[14px] text-slate-500">
          <a className="transition-colors hover:text-slate-900" href="#products">
            Products
          </a>
          <a className="transition-colors hover:text-slate-900" href="#why">
            Why us
          </a>
          <a className="transition-colors hover:text-slate-900" href="#contact">
            Contact
          </a>
          <Link className="transition-colors hover:text-slate-900" href="/sign-in">
            Staff sign in
          </Link>
        </div>
        <p className="text-[13px] text-slate-400">
          &copy; {new Date().getFullYear()} Blue Plastic Center
        </p>
      </div>
    </footer>
  )
}
