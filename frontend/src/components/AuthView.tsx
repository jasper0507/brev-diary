import { type FormEvent, useState } from 'react';
import { authRequest } from '../api';
import { deriveDiaryKey, exportDiaryKey } from '../crypto';
import { createStoredSession, saveSession, type StoredSession } from '../session';

type AuthViewProps = {
  onAuthenticated: (session: StoredSession, key: CryptoKey | unknown) => void;
  onPreview: () => void;
};

export function AuthView({ onAuthenticated, onPreview }: AuthViewProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!browserCryptoAvailable()) {
      setError('当前访问环境不支持浏览器加密，请使用 HTTPS 或 localhost 访问。');
      return;
    }
    setLoading(true);
    try {
      const auth = mode === 'register' ? await authRequest('/api/auth/register', email, password) : await authRequest('/api/auth/login', email, password);
      const token = auth.token ?? (mode === 'register' ? (await authRequest('/api/auth/login', email, password)).token : undefined);
      if (!token) {
        throw new Error('missing_token');
      }
      const key = await deriveDiaryKey(password, auth.user.kdfSalt);
      const rawKey = await exportDiaryKey(key);
      const session = createStoredSession({ token, email: auth.user.email, kdfSalt: auth.user.kdfSalt, rawKey });
      saveSession(session);
      onAuthenticated(session, key);
    } catch (error) {
      setError(authErrorMessage(mode, error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-label="登录注册">
        <p className="auth-kicker">PRIVATE DIARY</p>
        <h1>进入我的日记</h1>
        <div className="auth-tabs" aria-label="认证方式">
          <button className={mode === 'login' ? 'active' : ''} type="button" onClick={() => setMode('login')}>
            登录
          </button>
          <button className={mode === 'register' ? 'active' : ''} type="button" onClick={() => setMode('register')}>
            注册
          </button>
        </div>
        <form onSubmit={submit} className="auth-form">
          <label>
            邮箱
            <input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
          </label>
          <label>
            密码
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button className="auth-submit" type="submit" disabled={loading}>
            {mode === 'login' ? '进入日记' : '创建账号'}
          </button>
        </form>
        <button className="preview-button" type="button" onClick={onPreview}>
          本地预览
        </button>
      </section>
    </main>
  );
}

function browserCryptoAvailable() {
  const localHostnames = ['localhost', '127.0.0.1', '[::1]'];
  const isLocal = localHostnames.includes(window.location.hostname);
  return (window.isSecureContext || isLocal) && Boolean(globalThis.crypto?.subtle);
}

function authErrorMessage(mode: 'login' | 'register', error: unknown) {
  const code = error instanceof Error ? error.message : 'request_failed';
  if (mode === 'register') {
    if (code === 'invalid_credentials') {
      return '邮箱格式不正确，密码至少需要 6 位';
    }
    if (code === 'email_exists') {
      return '这个邮箱已经注册';
    }
  }
  if (mode === 'login' && code === 'invalid_credentials') {
    return '邮箱或密码错误';
  }
  return '服务暂时不可用，请稍后再试';
}
