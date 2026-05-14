export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-widest text-red-500 uppercase">
            Nukezone
          </h1>
          <p className="text-slate-500 text-sm mt-1 tracking-wider uppercase">Reborn</p>
        </div>
        {children}
      </div>
    </div>
  );
}
