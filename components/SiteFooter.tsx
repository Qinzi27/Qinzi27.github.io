import { site } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>© {new Date().getFullYear()} {site.author}. Built with Next.js.</p>
      <a href={site.links.github} target="_blank" rel="noreferrer">
        GitHub
      </a>
    </footer>
  );
}
