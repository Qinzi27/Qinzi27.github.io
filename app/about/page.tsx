import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description: "About Qinzi27."
};

export default function AboutPage() {
  return (
    <div className="page-stack">
      <header className="page-heading">
        <p className="eyebrow">About</p>
        <h1>Qinzi27</h1>
        <p>一个用来沉淀思考、记录项目、保存灵感的个人博客。</p>
      </header>

      <section className="about-grid">
        <div>
          <h2>What goes here</h2>
          <p>
            技术笔记、阅读摘要、产品想法、生活片段，以及那些暂时还没有完整答案的问题。
          </p>
        </div>
        <div>
          <h2>Now</h2>
          <p>
            正在重新搭建这个博客，让它更轻、更清晰，也更适合作为长期个人档案。
          </p>
        </div>
      </section>
    </div>
  );
}
