import { Logo } from "./Logo";

export function Header() {
  return (
    <header className="header">
      <div className="header-inner">
        <a className="brand" href="/" aria-label="DevCoach AI home">
          <Logo />
          <span className="brand-text">
            <span className="brand-name">DevCoach AI</span>
            <span className="brand-tagline">Code review for TypeScript, React and .NET</span>
          </span>
        </a>
        <span className="badge-demo">Free demo</span>
      </div>
    </header>
  );
}
