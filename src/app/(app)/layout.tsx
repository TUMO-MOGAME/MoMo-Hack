/** @jsxRuntime automatic */
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Chat · MoMo Kasi',
  description:
    'Ask about your money and the answer opens beside the conversation — wallet, fare split, stokvel, work near you.',
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return children;
}
