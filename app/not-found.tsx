import Link from "next/link";

export default function NotFound() {
  return (
    <div className="not-found">
      <p className="eyebrow">404</p>
      <h1>Page not found</h1>
      <p>这页还没有写出来，或者已经挪到别处了。</p>
      <Link className="button" href="/">
        Go home
      </Link>
    </div>
  );
}
