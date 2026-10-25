export const metadata = {
  title: 'CodeSentinel AI',
  description: 'Static analysis + LLM-explained repository audits',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#0b0f14', color: '#e7edf3' }}>
        {children}
      </body>
    </html>
  );
}
