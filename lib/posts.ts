import fs from "node:fs";
import path from "node:path";

export type PostMeta = {
  slug: string;
  title: string;
  date: string;
  summary: string;
  tags: string[];
  readingTime: string;
};

export type Post = PostMeta & {
  content: string;
};

const postsDirectory = path.join(process.cwd(), "content", "posts");

function parseFrontMatter(source: string) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);

  if (!match) {
    return {
      metadata: {},
      content: source.trim()
    };
  }

  const metadata: Record<string, string | string[]> = {};

  for (const line of match[1].split(/\r?\n/)) {
    const [rawKey, ...rawValueParts] = line.split(":");
    const key = rawKey.trim();
    const value = rawValueParts.join(":").trim();

    if (!key) {
      continue;
    }

    if (value.startsWith("[") && value.endsWith("]")) {
      metadata[key] = value
        .slice(1, -1)
        .split(",")
        .map((item) => item.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else {
      metadata[key] = value.replace(/^["']|["']$/g, "");
    }
  }

  return {
    metadata,
    content: match[2].trim()
  };
}

function getReadingTime(content: string) {
  const words = content
    .replace(/```[\s\S]*?```/g, "")
    .split(/\s+/)
    .filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(words / 220));

  return `${minutes} min read`;
}

function assertString(value: unknown, fallback: string) {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function assertTags(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function getAllPosts(): PostMeta[] {
  if (!fs.existsSync(postsDirectory)) {
    return [];
  }

  return fs
    .readdirSync(postsDirectory)
    .filter((fileName) => fileName.endsWith(".md"))
    .map((fileName) => {
      const slug = fileName.replace(/\.md$/, "");
      const fullPath = path.join(postsDirectory, fileName);
      const source = fs.readFileSync(fullPath, "utf8");
      const { metadata, content } = parseFrontMatter(source);

      return {
        slug,
        title: assertString(metadata.title, slug),
        date: assertString(metadata.date, "1970-01-01"),
        summary: assertString(metadata.summary, ""),
        tags: assertTags(metadata.tags),
        readingTime: getReadingTime(content)
      };
    })
    .sort((first, second) => (first.date < second.date ? 1 : -1));
}

export function getPostBySlug(slug: string): Post | null {
  const fullPath = path.join(postsDirectory, `${slug}.md`);

  if (!fs.existsSync(fullPath)) {
    return null;
  }

  const source = fs.readFileSync(fullPath, "utf8");
  const { metadata, content } = parseFrontMatter(source);

  return {
    slug,
    title: assertString(metadata.title, slug),
    date: assertString(metadata.date, "1970-01-01"),
    summary: assertString(metadata.summary, ""),
    tags: assertTags(metadata.tags),
    readingTime: getReadingTime(content),
    content
  };
}
