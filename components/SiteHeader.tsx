import Link from "next/link";
import { site } from "@/lib/site";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/blog", label: "Blog" },
  { href: "/map", label: "Map" },
  { href: "/about", label: "About" }
];

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label={`${site.name} home`}>
        {site.name}
      </Link>
      <nav aria-label="Main navigation">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
