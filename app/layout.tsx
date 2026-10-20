import type {Metadata} from 'next';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: 'Overlay365 Referee Agent | Computational Oncology Claim Auditor',
  description: 'A tool-bound LLM orchestrator that routes computational oncology claims through a deterministic audit pipeline—license gate, domain-aware baseline harness, leakage detector, and statistical referee—and writes an immutable verdict to a public evidence ledger, including negative results.',
  openGraph: {
    title: 'Overlay365 Referee Agent | Computational Oncology Claim Auditor',
    description: 'Deterministic audit pipeline for computational oncology claims: license gates, domain-aware baselines, leakage detection, and immutable evidence ledger.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Overlay365 Referee Agent | Computational Oncology Claim Auditor',
    description: 'Deterministic audit pipeline for computational oncology claims: license gates, domain-aware baselines, leakage detection, and immutable evidence ledger.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
