import Link from "next/link";
import { PostCard } from "@/components/PostCard";
import { getAllPosts } from "@/lib/posts";

export default function HomePage() {
  const posts = getAllPosts();
  const featuredPosts = posts.slice(0, 3);

  return (
    <>
      <section className="hero">
        <div className="hero__copy">
          <p className="eyebrow">Personal Blog</p>
          <h1>Notes for a quieter, sharper internet corner.</h1>
          <p>
            这里会收集 Qinzi27 的技术笔记、生活观察、项目记录和一些慢慢想清楚的事。
          </p>
          <div className="hero__actions">
            <Link className="button" href="/blog">
              Read Posts
            </Link>
            <Link className="button button--ghost" href="/about">
              About
            </Link>
          </div>
        </div>
        <div className="hero__visual" aria-hidden="true">
          <div className="note note--main">
            <span>Today</span>
            <strong>Write clearly.</strong>
            <p>Keep the useful parts. Leave room for wonder.</p>
          </div>
          <div className="note note--side">
            <span>Stack</span>
            <strong>Next.js</strong>
          </div>
        </div>
      </section>

      <section className="section-heading">
        <div>
          <p className="eyebrow">Latest</p>
          <h2>Recently Published</h2>
        </div>
        <Link href="/blog">View archive</Link>
      </section>

      <div className="post-grid">
        {featuredPosts.map((post) => (
          <PostCard key={post.slug} post={post} />
        ))}
      </div>
    </>
  );
}
