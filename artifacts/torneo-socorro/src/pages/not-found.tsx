export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="text-center space-y-4 animate-in zoom-in-95 duration-500">
        <h1 className="text-6xl font-extrabold text-primary tracking-tight">404</h1>
        <p className="text-xl text-muted-foreground font-medium">
          Página no encontrada
        </p>
      </div>
    </div>
  );
}
