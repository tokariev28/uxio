export function Header() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-center px-6">
        <a href="/">
          <img src="/logo.svg" alt="Uxio" width={74} height={38} />
        </a>
      </div>
    </header>
  );
}
