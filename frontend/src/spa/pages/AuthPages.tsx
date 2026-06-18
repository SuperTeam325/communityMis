import React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { ApiClient } from "../api";
import { useAuth } from "../auth";
import { Field, friendlyError } from "./shared";

export function LoginPage({ admin = false }: { api: ApiClient; admin?: boolean }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        const form = new FormData(event.currentTarget);
        try {
          if (admin) {
            await auth.loginAdmin({ username: form.get("username"), password: form.get("password") });
            navigate(params.get("redirect") || "/admin/dashboard", { replace: true });
          } else {
            await auth.loginUser({ username: form.get("username"), password: form.get("password") });
            navigate(params.get("redirect") || "/feed", { replace: true });
          }
        } catch (reason) {
          setError(friendlyError(reason));
        } finally {
          setBusy(false);
        }
      }}>
        <div className="auth-header">
          <div className="auth-brand-mark" aria-hidden="true">⏂</div>
          <h1>{admin ? "管理员登录" : "登录"}</h1>
          <p className="sub">邻里互助 · 时间银行</p>
        </div>
        <div className="auth-tabs" aria-label="认证入口">
          <span className="active" aria-current="page">登录</span>
          {!admin ? <Link to="/register">注册</Link> : null}
        </div>
        <div className="auth-body">
          <div className="auth-panel active">
            <Field label="账号 / 邮箱 / 手机号"><input id={admin ? "admin-account" : "login-username"} className="input" name="username" autoComplete="username" required placeholder="请输入用户名" /></Field>
            <Field label="密码"><input id={admin ? "admin-password" : "login-password"} className="input" name="password" type="password" autoComplete="current-password" required placeholder="请输入密码" /></Field>
            {error ? <p className="field-error" role="alert">{error}</p> : null}
            <button id="login-submit" className="auth-submit btn btn--primary" disabled={busy}>{busy ? "处理中..." : "登录"}</button>
          </div>
        </div>
        {!admin ? <div className="auth-footer"><Link to="/register">注册新账号</Link><span className="auth-separator">·</span><Link to="/feed">先看看社区</Link></div> : null}
      </form>
    </main>
  );
}

export function RegisterPage({ api }: { api: ApiClient }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [emailCodeToken, setEmailCodeToken] = React.useState("");
  const [sendingCode, setSendingCode] = React.useState(false);

  return (
    <main className="auth-shell auth-page">
      <section className="brand-panel" aria-label="注册说明">
        <Link className="back-link" to="/">← 返回入口</Link>
        <div className="brand-copy">
          <div className="brand-mark" aria-hidden="true">⏂</div>
          <h1>加入邻帮社区</h1>
          <p>用真实账户发布需求、接单互助，并通过评价沉淀信用。</p>
        </div>
        <div className="principles">
          <div className="principle"><strong>时间币</strong><span>服务价值用时间沉淀</span></div>
          <div className="principle"><strong>实名信用</strong><span>每笔订单都有记录</span></div>
          <div className="principle"><strong>邻里互助</strong><span>先从身边的小事开始</span></div>
        </div>
      </section>
      <form className="register-card auth-card" onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        const form = new FormData(event.currentTarget);
        try {
          await auth.registerUser({
            username: form.get("username"),
            password: form.get("password"),
            email,
            emailCode: form.get("emailCode"),
            emailCodeToken,
            displayName: form.get("displayName")
          });
          navigate("/feed", { replace: true });
        } catch (reason) {
          setError(friendlyError(reason));
        } finally {
          setBusy(false);
        }
      }}>
        <div className="card-head">
            <h1>注册</h1>
          <p className="muted">邮箱验证通过后即可进入社区。</p>
        </div>
        <div className="form-body">
        <Field label="账号（选填）"><input className="input" name="username" autoComplete="username" placeholder="例如 zhang_shu" /></Field>
        <small className="field-note">留空将自动生成用户名，之后可通过邮箱或手机号登录。</small>
        <Field label="昵称"><input className="input" name="displayName" /></Field>
        <Field label="邮箱">
          <input
            className="input"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => {
              setEmail(event.currentTarget.value.trim());
              setEmailCodeToken("");
            }}
          />
        </Field>
        <Field label="邮箱验证码">
          <div className="inline-form-row verify-row">
            <input className="input" name="emailCode" inputMode="numeric" autoComplete="one-time-code" required />
            <button
              className="verify-button btn btn--secondary"
              type="button"
              disabled={sendingCode || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)}
              onClick={async () => {
                setSendingCode(true);
                setError("");
                try {
                  const result = await api.verification.sendEmail({ email, purpose: "register" });
                  setEmailCodeToken(result.verificationToken);
                } catch (reason) {
                  setError(friendlyError(reason));
                } finally {
                  setSendingCode(false);
                }
              }}
            >
              {sendingCode ? "发送中..." : emailCodeToken ? "重新发送" : "发送验证码"}
            </button>
          </div>
        </Field>
        <Field label="密码"><input className="input" name="password" type="password" autoComplete="new-password" minLength={8} required /></Field>
        <div className="bonus-strip">
          <div className="bonus-icon">⏂</div>
          <div><strong>新用户奖励</strong><span>注册后可领取 5 时间币，用于发布第一单互助需求。</span></div>
        </div>
        {error ? <p className="field-error" role="alert">{error}</p> : null}
        <button className="auth-submit btn btn--primary" disabled={busy}>{busy ? "处理中..." : "注册并登录"}</button>
        <p className="login-link">已有账号？<Link to="/login">去登录</Link></p>
        </div>
      </form>
    </main>
  );
}
