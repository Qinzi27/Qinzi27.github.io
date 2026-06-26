import Link from "next/link";
import type { PostMeta } from "@/lib/posts";

export function PostCard({ post }: { post: PostMeta }) {
  return (
    <article className="post-card">
      <div className="post-card__meta">
        <time dateTime={post.date}>{post.date}</time>
        <span>{post.readingTime}</span>
      </div>
      <h2>
        <Link href={`/blog/${post.slug}`}>{post.title}</Link>
      </h2>
      <p>{post.summary}</p>
      {post.tags.length > 0 ? (
        <div className="tag-row" aria-label="Tags">
          {post.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      ) : null}
    </article>
  );
}
