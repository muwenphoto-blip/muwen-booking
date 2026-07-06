import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: '沐紋映像｜預約後台',
  description: '沐紋映像攝影工作室預約後台',
  manifest: '/manifest-admin.webmanifest',
  appleWebApp: {
    capable: true,
    title: '沐紋後台',
    statusBarStyle: 'default',
  },
  icons: {
    icon: '/admin-icon.svg',
    apple: '/admin-icon.svg',
  },
};

export const viewport: Viewport = {
  themeColor: '#1d4ed8',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
