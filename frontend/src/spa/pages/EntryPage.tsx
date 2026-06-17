import { Link } from "react-router-dom";

export function EntryPage() {
  return (
    <main className="entry-page">
      <section className="entry-panel">
        <h1>邻帮</h1>
        <p>邻里互助、任务协作、纠纷处理和平台管理入口。</p>
        <div className="action-row">
          <Link className="btn btn--primary" to="/feed">进入社区</Link>
          <Link className="btn btn--secondary" to="/admin/dashboard">管理后台</Link>
        </div>
      </section>
    </main>
  );
}
