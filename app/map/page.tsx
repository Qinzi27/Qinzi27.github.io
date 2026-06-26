import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Map",
  description: "A living map for Qinzi27's blog, notes, learning, and publishing workflow."
};

const workflow = [
  {
    title: "Capture",
    label: "00",
    text: "Ideas, links, screenshots, and loose notes land in the local inbox first."
  },
  {
    title: "Learn",
    label: "10",
    text: "Courses, articles, books, and experiments become learning notes."
  },
  {
    title: "Distill",
    label: "20",
    text: "Useful points are split into small cards, each holding one clear idea."
  },
  {
    title: "Map",
    label: "30",
    text: "Related cards are connected into themes, routes, and future writing paths."
  },
  {
    title: "Draft",
    label: "40",
    text: "Promising clusters become article drafts with examples and references."
  },
  {
    title: "Publish",
    label: "50",
    text: "Finished pieces move into the public blog after review and build checks."
  }
];

const mapNodes = [
  {
    title: "Blog",
    tone: "green",
    text: "Finished essays, technical notes, and project records."
  },
  {
    title: "Notes",
    tone: "blue",
    text: "Short thoughts, seeds, and half-shaped observations."
  },
  {
    title: "Learning",
    tone: "gold",
    text: "Study notes that can be reused instead of forgotten."
  },
  {
    title: "Assets",
    tone: "pink",
    text: "Images and decorations are reviewed before becoming public."
  }
];

const closeout = [
  "Built and published the Next.js blog repository.",
  "Added a local private workspace for assets and loose notes.",
  "Created a workflow for ideas, study notes, cards, maps, drafts, and publishing.",
  "Added a public knowledge map page as a visible home for the system."
];

export default function MapPage() {
  return (
    <div className="page-stack map-page">
      <header className="page-heading map-heading">
        <p className="eyebrow">Knowledge Map</p>
        <h1>A living workflow for ideas, notes, and blog posts.</h1>
        <p>
          This page shows how loose thoughts move from private notes into public writing.
          The private files stay local; only polished pieces become part of the blog.
        </p>
      </header>

      <section className="map-hero" aria-labelledby="workflow-map-title">
        <div>
          <p className="eyebrow">Visual</p>
          <h2 id="workflow-map-title">Thinking Workflow</h2>
          <p>
            A simple route from messy capture to finished posts. It is intentionally light:
            the system should help the writing, not become another project to maintain.
          </p>
        </div>
        <Image
          src="/maps/thinking-workflow.svg"
          width={760}
          height={420}
          alt="Qinzi27 thinking workflow from capture to publish"
          priority
        />
      </section>

      <section className="map-section" aria-labelledby="workflow-title">
        <div className="section-heading section-heading--compact">
          <div>
            <p className="eyebrow">Pipeline</p>
            <h2 id="workflow-title">From Spark To Post</h2>
          </div>
        </div>
        <div className="workflow-grid">
          {workflow.map((step) => (
            <article className="workflow-card" key={step.title}>
              <span>{step.label}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="map-section" aria-labelledby="garden-title">
        <div className="section-heading section-heading--compact">
          <div>
            <p className="eyebrow">Garden</p>
            <h2 id="garden-title">Current Spaces</h2>
          </div>
        </div>
        <div className="node-grid">
          {mapNodes.map((node) => (
            <article className={`map-node map-node--${node.tone}`} key={node.title}>
              <h3>{node.title}</h3>
              <p>{node.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="map-section closeout-panel" aria-labelledby="closeout-title">
        <div>
          <p className="eyebrow">Today</p>
          <h2 id="closeout-title">Closed Loop</h2>
          <p>Today&apos;s setup ended with a working blog, a private workflow, and a public map.</p>
        </div>
        <ul>
          {closeout.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
