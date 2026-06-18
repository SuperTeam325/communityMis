import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ApiClient } from "../api";
import { avatarImageUrl } from "../avatar";
import { useAuth } from "../auth";
import { FileUpload, Field, PageHeader, StateView, asArray, text, useAsync, useMutationTracker, useQueryParams } from "./shared";

/* ===== Helper ===== */
function timeAgo(dateStr: unknown): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(String(dateStr)).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return minutes + " 分钟前";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + " 小时前";
  const days = Math.floor(hours / 24);
  if (days < 7) return days + " 天前";
  if (days < 30) return Math.floor(days / 7) + " 周前";
  return Math.floor(days / 30) + " 个月前";
}

function creditStars(rating: unknown): string {
  const r = Math.round(Number(rating ?? 0));
  return "★".repeat(Math.min(r, 5)) + "☆".repeat(Math.max(0, 5 - r));
}

function creditLevel(avg: number, count: number): string {
  if (count === 0) return "暂无评价";
  if (avg >= 4.8) return "金牌服务者";
  if (avg >= 4.5) return "信誉优秀";
  if (avg >= 4) return "信誉良好";
  return "持续观察";
}

type ProfileTab = "posts" | "tasks" | "accepted" | "collections";

/* ===== Styles ===== */
const PROFILE_HEADER_STYLE: React.CSSProperties = {
  background: "linear-gradient(180deg, var(--accent-subtle) 0%, var(--bg) 60%)",
  padding: "var(--space-2xl) var(--space-lg) var(--space-lg)", textAlign: "center",
  position: "relative", overflow: "hidden"
};

const AVATAR_WRAP_STYLE: React.CSSProperties = { position: "relative", display: "inline-block" };

const AVATAR_XL_STYLE: React.CSSProperties = {
  background: "linear-gradient(135deg, var(--accent), var(--accent-hover))",
  width: 80, height: 80, borderRadius: "50%", display: "flex", alignItems: "center",
  justifyContent: "center", color: "#fff", fontSize: 28, fontWeight: 700, margin: "0 auto"
};

const AVATAR_IMG_STYLE: React.CSSProperties = {
  width: 80, height: 80, borderRadius: "50%", display: "block", objectFit: "cover",
  margin: "0 auto", background: "var(--border-light)"
};

const NAME_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700,
  marginTop: "var(--space-md)", color: "var(--fg)"
};

const BIO_STYLE: React.CSSProperties = { fontSize: 14, color: "var(--muted)", marginTop: 4 };

const SKILL_TAGS_STYLE: React.CSSProperties = {
  marginTop: 8, display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap"
};

const TAG_STYLE: React.CSSProperties = { fontSize: 12 };

const CREDIT_BADGE_STYLE: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4,
  background: "linear-gradient(135deg, oklch(65% 0.18 82), oklch(56% 0.16 70))",
  color: "#fff", padding: "5px 14px", borderRadius: "var(--radius-full)",
  fontSize: 13, fontWeight: 700, marginTop: "var(--space-sm)",
  boxShadow: "0 2px 8px rgba(217,119,87,0.3)"
};

const CREDIT_LEVEL_STYLE: React.CSSProperties = { opacity: 0.7, fontWeight: 400, marginLeft: 4 };

const STATS_ROW_STYLE: React.CSSProperties = {
  display: "flex", justifyContent: "center", gap: "var(--space-3xl)",
  padding: "var(--space-lg) 0", margin: "0 var(--space-lg)",
  borderTop: "1px solid var(--border-light)", borderBottom: "1px solid var(--border-light)"
};

const STAT_ITEM_STYLE: React.CSSProperties = { textAlign: "center", cursor: "pointer" };

const STAT_NUM_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--fg)"
};

const STAT_LABEL_STYLE: React.CSSProperties = {
  fontSize: 12, color: "var(--muted)", marginTop: 4, fontWeight: 500
};

const PROFILE_TABS_STYLE: React.CSSProperties = {
  display: "flex", gap: 0, margin: "var(--space-lg)",
  background: "var(--border-light)", borderRadius: "var(--radius-md)", padding: 4
};

const CONTENT_LIST_STYLE: React.CSSProperties = {
  padding: "0 var(--space-lg)", maxWidth: 640, margin: "0 auto"
};

const WALLET_CARD_STYLE: React.CSSProperties = {
  background: "linear-gradient(135deg, var(--fg) 0%, oklch(24% 0.02 80) 100%)",
  borderRadius: "var(--radius-xl)", padding: "var(--space-xl)", color: "#fff",
  marginBottom: "var(--space-2xl)", cursor: "pointer", position: "relative", overflow: "hidden"
};

const WALLET_LABEL_STYLE: React.CSSProperties = { fontSize: 13, opacity: 0.7, marginBottom: 4, fontWeight: 500 };

const WALLET_BALANCE_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-mono)", fontSize: 36, fontWeight: 700
};

const WALLET_FROZEN_STYLE: React.CSSProperties = { fontSize: 12, opacity: 0.5, marginTop: 4 };

const WALLET_ACTIONS_STYLE: React.CSSProperties = {
  display: "flex", gap: "var(--space-md)", marginTop: "var(--space-lg)"
};

const WALLET_BTN_STYLE: React.CSSProperties = {
  padding: "8px 18px", borderRadius: "var(--radius-full)",
  background: "rgba(255,255,255,0.15)", color: "#fff",
  fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer"
};

const SETTINGS_LIST_STYLE: React.CSSProperties = {
  background: "var(--surface)", borderRadius: "var(--radius-lg)",
  border: "1.5px solid var(--border-light)", overflow: "hidden", marginBottom: "var(--space-2xl)"
};

const SETTINGS_ICON_BASE: React.CSSProperties = {
  width: 40, height: 40, borderRadius: "var(--radius-md)", display: "flex",
  alignItems: "center", justifyContent: "center", marginRight: "var(--space-md)",
  fontSize: 18, fontWeight: 700, flexShrink: 0
};

const SETTINGS_TEXT_STYLE: React.CSSProperties = { flex: 1 };

const SETTINGS_TITLE_STYLE: React.CSSProperties = { fontSize: 15, fontWeight: 600, color: "var(--fg)" };

const SETTINGS_DESC_STYLE: React.CSSProperties = { fontSize: 12, color: "var(--muted)", marginTop: 2 };

const SETTINGS_ITEM_STYLE: React.CSSProperties = {
  display: "flex", alignItems: "center", padding: "var(--space-lg)",
  borderBottom: "1px solid var(--border-light)", textDecoration: "none", color: "inherit"
};

const CHEVRON_STYLE: React.CSSProperties = { color: "var(--border)", fontSize: 18, fontWeight: 300 };

const DIVIDER_STYLE: React.CSSProperties = { height: 1, background: "var(--border-light)" };

const LOGOUT_BTN_STYLE: React.CSSProperties = {
  display: "flex", alignItems: "center", padding: "var(--space-lg)", width: "100%",
  border: "none", background: "transparent", cursor: "pointer",
  color: "inherit", textAlign: "left", font: "inherit"
};

const MINI_CARD_STYLE: React.CSSProperties = {
  background: "var(--surface)", borderRadius: "var(--radius-lg)",
  border: "1.5px solid var(--border-light)", padding: "var(--space-lg)",
  marginBottom: "var(--space-md)", cursor: "pointer"
};

/* ===== ProfilePage component ===== */
export function ProfilePage({ api }: { api: ApiClient }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = React.useState<ProfileTab>("posts");

  const userState = useAsync(() => api.users.me(), [api]);
  const userData = userState.data as Record<string, unknown> | null;
  const user = userData?.user as Record<string, unknown> | null;
  const wallet = userData?.wallet as Record<string, unknown> | null;
  const credit = userData?.credit as Record<string, unknown> | null;

  const userId = String(user?.userId ?? "");
  const avatarUrl = avatarImageUrl(user, api);

  const postsState = useAsync(() => api.communityPosts.list({ authorId: userId, pageSize: 50 }), [api, userId]);
  const requestsState = useAsync(() => api.requests.list({ publisherId: userId, pageSize: 50 }), [api, userId]);
  const ordersState = useAsync(() => api.orders.list({ providerId: userId, pageSize: 50 }), [api, userId]);
  const collectionsState = useAsync(() => api.collections.me({ pageSize: 50 }), [api]);

  const posts = asArray<Record<string, unknown>>(postsState.data, "posts");
  const requests = asArray<Record<string, unknown>>(requestsState.data, "requests");
  const orders = asArray<Record<string, unknown>>(ordersState.data, "orders");
  const collections = asArray<Record<string, unknown>>(collectionsState.data, "collections");

  const loading = userState.loading || postsState.loading || requestsState.loading || ordersState.loading;
  const error = userState.error ?? postsState.error ?? requestsState.error ?? ordersState.error;

  return (
    <>
      <StateView loading={loading} error={error} empty={!user}>
        <section className="profile-header-bg" style={PROFILE_HEADER_STYLE}>
          <div className="avatar-wrap" style={AVATAR_WRAP_STYLE}>
            {avatarUrl
              ? <img className="avatar xl" style={AVATAR_IMG_STYLE} src={avatarUrl} alt="" />
              : <div className="avatar xl" style={AVATAR_XL_STYLE}>{text(user?.displayName ?? user?.username).slice(0, 1)}</div>}
            <FileUpload purpose="avatar" businessType="user" visibility="public" onUploaded={async (formData) => {
              const result = await api.files.upload(formData);
              const fileId = text((result.file as Record<string, unknown>)?.fileId ?? result.fileId, "");
              if (fileId) {
                await api.users.avatar(fileId);
                await auth.refresh("user");
              }
              userState.reload();
            }} />
          </div>
          <h2 className="profile-name" style={NAME_STYLE}>{text(user?.displayName ?? user?.username)}</h2>
          <p className="profile-bio" style={BIO_STYLE}>{text(user?.bio, "暂无简介")}</p>
          {!!user?.skillTags && asArray<string>(user.skillTags, "").length > 0 && (
            <div style={SKILL_TAGS_STYLE}>
              {asArray<string>(user.skillTags, "").map((tag: string) => (
                <span key={tag} className="badge badge--accent" style={TAG_STYLE}>{tag}</span>
              ))}
            </div>
          )}
          {credit && (
            <div className="credit-badge" style={CREDIT_BADGE_STYLE}>
              <span>{creditStars(credit?.averageRating)}</span>
              <span>信誉 {text(credit?.averageRating, "0")}</span>
              <span style={CREDIT_LEVEL_STYLE}>{creditLevel(Number(credit?.averageRating ?? 0), Number(credit?.reviewCount ?? 0))}</span>
            </div>
          )}
        </section>
        <div className="stats-row" style={STATS_ROW_STYLE}>
          <div className="stat-item" style={STAT_ITEM_STYLE} onClick={() => setTab("posts")}>
            <div className="num" style={STAT_NUM_STYLE}>{posts.length}</div>
            <div className="label" style={STAT_LABEL_STYLE}>帖子</div>
          </div>
          <div className="stat-item" style={STAT_ITEM_STYLE} onClick={() => setTab("tasks")}>
            <div className="num" style={STAT_NUM_STYLE}>{requests.length}</div>
            <div className="label" style={STAT_LABEL_STYLE}>任务</div>
          </div>
          <div className="stat-item" style={STAT_ITEM_STYLE} onClick={() => setTab("accepted")}>
            <div className="num" style={STAT_NUM_STYLE}>{orders.length}</div>
            <div className="label" style={STAT_LABEL_STYLE}>接单</div>
          </div>
        </div>
        <div className="profile-tabs" style={PROFILE_TABS_STYLE}>
          {([
            { key: "posts" as ProfileTab, label: "我的帖子" },
            { key: "tasks" as ProfileTab, label: "我的任务" },
            { key: "accepted" as ProfileTab, label: "接单记录" },
            { key: "collections" as ProfileTab, label: "我的收藏" }
          ]).map((item: { key: ProfileTab; label: string }) => (
            <button key={item.key} className={tab === item.key ? "active" : ""}
              style={{
                flex: 1, padding: "10px 6px", borderRadius: "var(--radius-sm)",
                fontSize: 14, fontWeight: tab === item.key ? 700 : 500,
                color: tab === item.key ? "var(--fg)" : "var(--muted)",
                border: "none", cursor: "pointer",
                background: tab === item.key ? "var(--surface)" : "transparent",
                boxShadow: tab === item.key ? "var(--shadow-sm)" : "none"
              }}
              onClick={() => setTab(item.key)}>{item.label}</button>
          ))}
        </div>
        <div className="content-list" style={CONTENT_LIST_STYLE}>
          {tab === "posts" && (
            <TabPanel loading={postsState.loading} error={postsState.error} empty={posts.length === 0}>
              {posts.map((post: Record<string, unknown>) => <MiniCard key={text(post.postId)} data={post} type="post" />)}
            </TabPanel>
          )}
          {tab === "tasks" && (
            <TabPanel loading={requestsState.loading} error={requestsState.error} empty={requests.length === 0}>
              {requests.map((req: Record<string, unknown>) => <MiniCard key={text(req.requestId)} data={req} type="request" />)}
            </TabPanel>
          )}
          {tab === "accepted" && (
            <TabPanel loading={ordersState.loading} error={ordersState.error} empty={orders.length === 0}>
              {orders.map((order: Record<string, unknown>) => <MiniCard key={text(order.orderId)} data={order} type="order" />)}
            </TabPanel>
          )}
          {tab === "collections" && (
            <TabPanel loading={collectionsState.loading} error={collectionsState.error} empty={collections.length === 0}>
              {collections.map((col: Record<string, unknown>) => <MiniCard key={text(col.targetId)} data={col} type="collection" />)}
            </TabPanel>
          )}
          <Link className="wallet-card" style={{ ...WALLET_CARD_STYLE, display: "block", textDecoration: "none" }} to="/wallet">
            <div style={WALLET_LABEL_STYLE}>我的钱包</div>
            <div style={WALLET_BALANCE_STYLE}>{text(wallet?.balance, "0.00")}</div>
            <div style={WALLET_FROZEN_STYLE}>冻结金额: {text(wallet?.frozenBalance, "0.00")}</div>
            <div style={WALLET_ACTIONS_STYLE}>
              <span style={WALLET_BTN_STYLE}>查看钱包</span>
            </div>
          </Link>
          <div className="settings-list" style={SETTINGS_LIST_STYLE}>
            <SettingsItem icon="✏" iconBg="var(--accent-subtle)" iconColor="var(--accent)" title="编辑资料" desc="修改头像、昵称、个人简介" href="/settings" />
            <SettingsItem icon="📋" iconBg="var(--secondary-light)" iconColor="var(--secondary)" title="我的订单" desc="发布和接单的全部记录" href="/orders" />
            <SettingsItem icon="⭐" iconBg="oklch(94% 0.04 82)" iconColor="oklch(65% 0.18 82)" title="信用详情" desc="评分分布、评价记录和信誉等级" href={`/users/${userId}/credit`} />
            <SettingsItem icon="⚙" iconBg="var(--border-light)" iconColor="var(--muted)" title="设置" desc="通知、隐私、通用偏好" href="/settings" />
            <div className="divider" style={DIVIDER_STYLE}></div>
            {(user?.role === "admin" || user?.role === "super_admin") && (
              <SettingsItem icon="🛡" iconBg="var(--fg)" iconColor="var(--accent-light)" title="管理后台" desc="用户管理、争议处理、平台统计" href="/admin/dashboard" />
            )}
            <button className="settings-item" onClick={() => auth.logout().then(() => navigate("/login", { replace: true }))}
              style={LOGOUT_BTN_STYLE}>
              <div style={{ ...SETTINGS_ICON_BASE, background: "var(--danger-light)", color: "var(--danger)" }}>{"🚪"}</div>
              <div style={SETTINGS_TEXT_STYLE}>
                <div style={SETTINGS_TITLE_STYLE}>退出登录</div>
                <div style={SETTINGS_DESC_STYLE}>清除当前浏览器登录态</div>
              </div>
              <span style={CHEVRON_STYLE}>{"›"}</span>
            </button>
          </div>
        </div>
      </StateView>
    </>
  );
}

/* ===== Sub-components ===== */

function SettingsItem({ icon, iconBg, iconColor, title, desc, href }: {
  icon: string; iconBg: string; iconColor: string; title: string; desc: string; href: string;
}) {
  return (
    <Link to={href} className="settings-item" style={SETTINGS_ITEM_STYLE}>
      <div style={{ ...SETTINGS_ICON_BASE, background: iconBg, color: iconColor }}>{icon}</div>
      <div style={SETTINGS_TEXT_STYLE}>
        <div style={SETTINGS_TITLE_STYLE}>{title}</div>
        <div style={SETTINGS_DESC_STYLE}>{desc}</div>
      </div>
      <span style={CHEVRON_STYLE}>{"›"}</span>
    </Link>
  );
}

function MiniCard({ data, type }: { data: Record<string, unknown>; type: string }) {
  const title = text(
    data.title ?? (data as any).target?.title ?? ("Item " + text(data.postId ?? data.requestId ?? data.orderId ?? data.targetId))
  );
  const badge = text(
    type === "post" ? (data as any).category?.label ?? "社区分享"
    : type === "request" ? text(data.coinAmount, "0") + " 时间币"
    : type === "order" ? text(data.amount ?? data.coinAmount, "0") + " 时间币"
    : text(data.targetType, "unknown")
  );
  const href =
    type === "post" ? "/posts/" + encodeURIComponent(text(data.postId))
    : type === "request" ? "/posts/" + encodeURIComponent(text(data.requestId))
    : type === "order" ? "/orders/" + encodeURIComponent(text(data.orderId))
    : type === "collection" ? collectionHref(data)
    : "#";

  return (
    <Link className="mini-card" style={{ ...MINI_CARD_STYLE, display: "block", textDecoration: "none", color: "inherit" }} to={href}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-sm)" }}>
        <span style={{ fontSize: 15, fontWeight: 700, flex: 1, color: "var(--fg)" }}>{title}</span>
        <span className={type === "post" ? "badge badge--success" : "reward-badge"}
          style={type !== "post" ? {
            display: "inline-flex", alignItems: "center", gap: 3,
            background: "linear-gradient(135deg, oklch(65% 0.18 82), oklch(56% 0.16 70))",
            color: "#fff", padding: "4px 12px", borderRadius: "var(--radius-full)",
            fontSize: 13, fontWeight: 700, whiteSpace: "nowrap"
          } : { fontSize: 12 }}>
          {badge}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-lg)", fontSize: 12, color: "var(--muted)", marginTop: "var(--space-sm)" }}>
        {type === "post" && (
          <>
            <span>{String(data.likeCount ?? 0)} 赞</span>
            <span>{String(data.commentCount ?? 0)} 评论</span>
          </>
        )}
        <span style={{ marginLeft: "auto" }}>{timeAgo(data.createdAt)}</span>
      </div>
    </Link>
  );
}

function collectionHref(data: Record<string, unknown>): string {
  const target = (data as any).target as Record<string, unknown> | undefined;
  const href = String(target?.href ?? "");
  if (href.startsWith("/posts/") || href.startsWith("/orders/") || href.startsWith("/users/")) return href;
  const targetId = encodeURIComponent(String(data.targetId ?? ""));
  return data.targetType === "community_post" ? `/posts/${targetId}` : `/posts/${targetId}`;
}

function TabPanel({ loading, error, empty, children }: {
  loading?: boolean;
  error?: Error | null;
  empty?: boolean;
  children: React.ReactNode;
}) {
  if (loading) return <div className="state-card" role="status" style={{ padding: "var(--space-xl)", textAlign: "center", color: "var(--muted)" }}>加载中...</div>;
  if (error) return <div className="state-card state-card--error" role="alert" style={{ padding: "var(--space-xl)", textAlign: "center" }}>{error.message}</div>;
  if (empty) return <div className="state-card" style={{ padding: "var(--space-xl)", textAlign: "center", color: "var(--muted)" }}>暂无内容</div>;
  return <>{children}</>;
}

/* ===== Enhanced Settings page ===== */
export function SettingsPage({ api }: { api: ApiClient }) {
  const state = useAsync(() => api.settings.me(), [api]);
  const mutation = useMutationTracker();
  const settings = (state.data?.settings ?? {}) as Record<string, unknown>;
  const notif = (settings.notifications ?? {}) as Record<string, unknown>;
  const priv = (settings.privacy ?? {}) as Record<string, unknown>;
  const prefs = (settings.preferences ?? {}) as Record<string, unknown>;
  return (
    <>
      <PageHeader title="设置" description="管理通知、隐私、通用偏好和账号体验。" />
      <StateView loading={state.loading} error={state.error}>
        <form className="settings-content form-grid" onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          await mutation.run(() => api.settings.updateMe({
            notifications: {
              newMessages: form.get("notif_messages") === "on",
              interactions: form.get("notif_interactions") === "on",
              orderStatus: form.get("notif_orders") === "on",
              announcements: form.get("notif_announcements") === "on"
            },
            privacy: {
              showCommunity: form.get("priv_community") === "on",
              searchable: form.get("priv_searchable") === "on",
              phoneVisible: form.get("priv_phone") === "on"
            },
            preferences: {
              postVisibility: form.get("pref_post_visibility"),
              language: form.get("pref_language"),
              darkMode: form.get("pref_dark_mode")
            }
          }), () => state.reload());
        }}>
          <div className="settings-group">
            <div className="settings-group-title">通知</div>
            <div className="settings-card">
              <SettingsCheckRow icon="✉" label="新消息提醒" desc="有人私信你时推送通知" name="notif_messages" defaultChecked={Boolean(notif.newMessages ?? true)} />
              <SettingsCheckRow icon="♥" label="互动提醒" desc="点赞、评论、关注等互动提醒" name="notif_interactions" defaultChecked={Boolean(notif.interactions ?? true)} />
              <SettingsCheckRow icon="✓" label="订单状态提醒" desc="有人接单、完成、即将截止等提醒" name="notif_orders" defaultChecked={Boolean(notif.orderStatus ?? true)} />
              <SettingsCheckRow icon="!" label="平台公告" desc="物业通知、社区活动等广播消息" name="notif_announcements" defaultChecked={Boolean(notif.announcements ?? true)} />
            </div>
          </div>
          <div className="settings-group">
            <div className="settings-group-title">隐私</div>
            <div className="settings-card">
              <SettingsCheckRow icon="⌂" label="在社区可见" desc="资料页和帖子中展示你的公开资料" name="priv_community" defaultChecked={Boolean(priv.showCommunity ?? true)} />
              <SettingsCheckRow icon="⌕" label="允许被搜索" desc="允许邻居通过搜索找到你" name="priv_searchable" defaultChecked={Boolean(priv.searchable ?? true)} />
              <SettingsCheckRow icon="☎" label="手机号可见" desc="仅在你同意时展示联系方式" name="priv_phone" defaultChecked={Boolean(priv.phoneVisible ?? false)} />
            </div>
          </div>
          <div className="settings-group">
            <div className="settings-group-title">通用</div>
            <div className="settings-card settings-form-card">
              <Field label="帖子可见范围">
                <select name="pref_post_visibility" defaultValue={text(prefs.postVisibility, "community")}>
                  <option value="community">全社区</option>
                  <option value="nearby">附近邻里</option>
                  <option value="private">仅自己</option>
                </select>
              </Field>
              <Field label="语言">
                <select name="pref_language" defaultValue={text(prefs.language, "zh-CN")}>
                  <option value="zh-CN">简体中文</option>
                  <option value="zh-TW">繁體中文</option>
                  <option value="en">English</option>
                </select>
              </Field>
              <Field label="深色模式">
                <select name="pref_dark_mode" defaultValue={text(prefs.darkMode, "system")}>
                  <option value="system">跟随系统</option>
                  <option value="light">浅色</option>
                  <option value="dark">深色</option>
                </select>
              </Field>
            </div>
          </div>
          {mutation.error ? <p className="field-error" role="alert">{mutation.error}</p> : null}
          <button className="btn btn--primary btn--full" disabled={mutation.busy}>{mutation.busy ? "保存中..." : "保存设置"}</button>
        </form>
      </StateView>
    </>
  );
}

/* ===== Enhanced UserPublicPage ===== */
export function UserPublicPage({ api }: { api: ApiClient }) {
  const { id = "" } = useParams();
  const auth = useAuth();
  const state = useAsync(() => api.users.public(id), [api, id]);
  const user = (state.data?.user ?? state.data) as Record<string, unknown> | null;
  const viewer = (state.data?.viewer ?? {}) as Record<string, unknown>;
  const credit = (state.data?.credit ?? {}) as Record<string, unknown>;
  const isSelf = Boolean(viewer.isSelf);
  const [following, setFollowing] = React.useState(Boolean(viewer.isFollowing));
  const avatarUrl = avatarImageUrl(user, api);

  return (
    <>
      <PageHeader title="服务者公开主页" description="查看对方公开信用、技能标签和联系入口。" action={
        !isSelf ? (
          <button className={"btn " + (following ? "btn--secondary" : "btn--primary")}
            onClick={async () => {
              if (following) {
                await api.users.unfollow(id).catch(() => {});
                setFollowing(false);
              } else {
                await api.users.follow(id).catch(() => {});
                setFollowing(true);
              }
            }}>
            {following ? "已关注" : "+ 关注"}
          </button>
        ) : null
      } />
      <StateView loading={state.loading} error={state.error} empty={!user}>
        <section className="profile-header-bg public-hero" style={PROFILE_HEADER_STYLE}>
          {avatarUrl
            ? <img className="avatar xl" style={AVATAR_IMG_STYLE} src={avatarUrl} alt="" />
            : <div className="avatar xl" style={AVATAR_XL_STYLE}>{text(user?.displayName ?? user?.username).slice(0, 1)}</div>}
          <h2 style={NAME_STYLE}>{text(user?.displayName ?? user?.username)}</h2>
          <p style={BIO_STYLE}>{text(user?.bio, "暂无简介")}</p>
          {!!user?.skillTags && asArray<string>(user.skillTags, "").length > 0 && (
            <div style={SKILL_TAGS_STYLE}>
              {asArray<string>(user.skillTags, "").map((tag: string) => (
                <span key={tag} className="badge badge--accent" style={TAG_STYLE}>{tag}</span>
              ))}
            </div>
          )}
          {!!credit?.averageRating && (
            <div className="credit-badge" style={CREDIT_BADGE_STYLE}>
              <span>{creditStars(credit.averageRating)}</span>
              <span>信誉 {text(credit.averageRating)}</span>
            </div>
          )}
          <div className="action-row" style={{ marginTop: "var(--space-lg)", display: "flex", gap: "var(--space-sm)", justifyContent: "center" }}>
            {!isSelf && (
              <>
                <button className="btn btn--primary" onClick={async () => {
                  await api.users.follow(id);
                  setFollowing(true);
                }}>{following ? "已关注" : "关注"}</button>
                <Link className="btn btn--secondary" to={"/messages?userId=" + encodeURIComponent(id)}>联系用户</Link>
              </>
            )}
          </div>
          <aside className="hero-score" aria-label="信用评分">
            <div className="score-number">{text(credit.averageRating, "0")}</div>
            <div className="score-label">信用评分 · {text(credit.reviewCount, "0")} 条评价</div>
          </aside>
        </section>
      </StateView>
    </>
  );
}

/* ===== Enhanced Credit page ===== */
export function CreditPage({ api }: { api: ApiClient }) {
  const { id } = useParams<{ id?: string }>();
  const state = useAsync(() => id ? api.users.credit(id) : api.users.me(), [api, id]);
  const credit = (state.data?.credit ?? state.data) as Record<string, unknown> | null;
  const reviews = asArray<Record<string, unknown>>(id ? state.data : credit, "reviews");
  const distribution = asArray<Record<string, unknown>>(credit?.ratingDistribution, "ratingDistribution");

  return (
    <>
      <PageHeader title="信用详情" />
      <StateView loading={state.loading} error={state.error}>
        <section className="credit-hero panel" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, fontWeight: 800, color: "var(--fg)", fontFamily: "var(--font-display)" }}>
            {text(credit?.averageRating, "—")}
          </div>
          <div style={{ fontSize: 20, marginTop: 4 }}>{creditStars(credit?.averageRating)}</div>
          <div className="credit-badge" style={CREDIT_BADGE_STYLE}>
            {creditLevel(Number(credit?.averageRating ?? 0), Number(credit?.reviewCount ?? 0))}
          </div>
        </section>
        {credit && (
          <div className="metric-grid">
            <div className="metric-card"><span>评价总数</span><strong>{String(credit.reviewCount ?? 0)}</strong></div>
            <div className="metric-card"><span>好评率</span><strong>{String(credit.positiveRate ?? 0)}%</strong></div>
            <div className="metric-card"><span>作为服务者</span><strong>{String(credit.asProvider ?? 0)} 单</strong></div>
            <div className="metric-card"><span>作为发布者</span><strong>{String(credit.asRequester ?? 0)} 单</strong></div>
          </div>
        )}
        {distribution.length > 0 && (
          <section className="panel">
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>评分分布</h3>
            {distribution.map((item) => (
              <div key={String(item.rating)} style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
                <span style={{ width: 30, fontWeight: 600 }}>{String(item.rating)} 星</span>
                <div style={{ flex: 1, height: 8, background: "var(--border-light)", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", background: "var(--accent)", borderRadius: 4, width: String(item.percent ?? 0) + "%", minWidth: Number(item.count ?? 0) > 0 ? 4 : 0 }}></div>
                </div>
                <span style={{ width: 40, textAlign: "right", fontSize: 13, color: "var(--muted)" }}>{String(item.count ?? 0)}</span>
              </div>
            ))}
          </section>
        )}
        <section className="panel">
          <h3 style={{ fontSize: 16, fontWeight: 700 }}>评价记录</h3>
          <StateView empty={reviews.length === 0}>
            <div className="card-list">
              {reviews.map((review) => (
                <article className="card" key={text(review.reviewId)} style={{ padding: "var(--space-lg)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-sm)" }}>
                    <strong>{text(review.rating)} 分 {creditStars(review.rating)}</strong>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>{timeAgo(review.createdAt)}</span>
                  </div>
                  <p style={{ color: "var(--fg)", lineHeight: 1.6 }}>{text(review.comment, "用户未填写评价内容")}</p>
                  {!!review.orderTitle && <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>订单: {text(review.orderTitle)}</p>}
                  {!!review.direction && <span className="badge badge--accent" style={{ fontSize: 11, marginTop: 4, display: "inline-block" }}>{text(review.direction)}</span>}
                </article>
              ))}
            </div>
          </StateView>
        </section>
        {!!credit?.rules && (
          <section className="panel">
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>规则说明</h3>
            <ul style={{ paddingLeft: 20, fontSize: 13, color: "var(--muted)", lineHeight: 1.8 }}>
              {asArray<string>(credit.rules, "").map((rule: string, i: number) => (
                <li key={i}>{rule}</li>
              ))}
            </ul>
          </section>
        )}
      </StateView>
    </>
  );
}

/* ===== Enhanced Help page ===== */
export function HelpPage() {
  return (
    <>
      <section className="help-hero">
        <PageHeader title="帮助与规则" description="覆盖发布、接单、时间币、信用、纠纷和 AI 助手边界。" action={<Link className="btn btn--primary" to="/ai/assistant?scene=rules">询问 AI 助手</Link>} />
      </section>
      <div className="help-grid">
        <aside className="quick-links">
          <Link className="quick-link" to="/wallet"><span>时间币钱包</span><span>→</span></Link>
          <Link className="quick-link" to="/wallet/freeze"><span>冻结明细</span><span>→</span></Link>
          <Link className="quick-link" to="/post"><span>发布需求</span><span>→</span></Link>
          <Link className="quick-link" to="/tasks"><span>任务市场</span><span>→</span></Link>
          <Link className="quick-link" to="/orders"><span>我的订单</span><span>→</span></Link>
          <Link className="quick-link" to="/disputes/new"><span>发起纠纷</span><span>→</span></Link>
        </aside>
        <section className="faq-list prose">
          {[
            ["时间币是什么？如何获得？", "时间币用于衡量社区互助服务价值。完成订单、参与平台活动或获得奖励后会增加余额。"],
            ["我的时间币为什么被冻结？", "发布任务或进入纠纷流程时，相关时间币会被冻结，待订单完成、取消或裁决后释放或结算。"],
            ["发布需求和接单有哪些限制？", "需求描述应清晰真实，报酬要合理，接单后应按约定完成并保留必要沟通记录。"],
            ["订单如何确认完成并结算？", "服务完成后双方确认，系统根据订单金额自动结算并生成钱包流水。"],
            ["评价会怎样影响信用分？", "公开评价会进入信用详情，评分、标签和文字反馈都会影响后续匹配与信任判断。"],
            ["什么时候可以发起纠纷？", "服务未完成、质量争议或沟通无法达成一致时，可从订单页发起纠纷并提交证据。"],
            ["AI 助手能做什么，不能做什么？", "AI 可辅助筛选、草稿和规则问答，但关键操作仍必须由用户或管理员在业务页面确认。"]
          ].map(([question, answer]) => (
            <article className="faq-card open" key={question}>
              <div className="faq-question"><span>{question}</span><span className="tag">规则</span></div>
              <div className="faq-answer"><p>{answer}</p></div>
            </article>
          ))}
        </section>
      </div>
    </>
  );
}

function SettingsCheckRow({ icon, label, desc, name, defaultChecked }: { icon: string; label: string; desc: string; name: string; defaultChecked: boolean }) {
  return (
    <label className="settings-row">
      <span className="row-icon">{icon}</span>
      <span className="row-text"><span className="row-label">{label}</span><span className="row-desc">{desc}</span></span>
      <span className="row-right"><input type="checkbox" name={name} defaultChecked={defaultChecked} /></span>
    </label>
  );
}
