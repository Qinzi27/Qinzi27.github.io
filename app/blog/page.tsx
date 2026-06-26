import type { Metadata } from "next";
import { PostCard } from "@/components/PostCard";
import { getAllPosts } from "@/lib/posts";

export const metadata: Metadata = {
  title: "Blog",
  description: "All posts from Qinzi27."
};

export default function BlogPage() {
  const posts = getAllPosts();
  const tags = Array.from(new Set(posts.flatMap((post) => post.tags))).sort();

  return (
    <div className="page-stack">
      <header className="page-heading">
        <p className="eyebrow">Archive</p>
        <h1>Blog</h1>
        <p>按时间整理的文章、札记和项目复盘。</p>
      </header>

      {tags.length > 0 ? (
        <div className="tag-row tag-row--large" aria-label="All tags">
          {tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      ) : null}

      <div className="post-list">
        {posts.map((post) => (
          <PostCard key={post.slug} post={post} />
        ))}
      </div>
    </div>
  );
}
