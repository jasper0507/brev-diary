import { type FormEvent, useState } from 'react';
import { authRequest } from '../api';
import { importDiaryKey } from '../crypto';
import { createStoredSession, saveSession, type StoredSession } from '../session';

type AuthMode = 'login' | 'register' | 'forgot';

type AuthViewProps = {
  initialEmail?: string;
  initialMode?: AuthMode;
  onAuthenticated: (session: StoredSession, key: CryptoKey | unknown) => void;
  onPreview: () => void;
};

export function AuthView({ initialEmail = '', initialMode = 'login', onAuthenticated, onPreview }: AuthViewProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'error' | 'success'>('error');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    clearMessage();

    if ((mode === 'register' || mode === 'forgot') && password !== confirmPassword) {
      showError('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'forgot') {
        await authRequest('/api/auth/forgot-password', email, password);
        setMode('login');
        setPassword('');
        setConfirmPassword('');
        showSuccess('密码已重置，请重新登录');
        return;
      }

      const auth = await authRequest(mode === 'register' ? '/api/auth/register' : '/api/auth/login', email, password);
      if (!auth.token) {
        throw new Error('missing_token');
      }
      const key = await importDiaryKey(auth.user.diaryKey);
      const session = createStoredSession({ token: auth.token, email: auth.user.email, rawKey: auth.user.diaryKey });
      saveSession(session);
      onAuthenticated(session, key);
    } catch (error) {
      showError(authErrorMessage(mode, error));
    } finally {
      setLoading(false);
    }
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setPassword('');
    setConfirmPassword('');
    clearMessage();
  }

  function clearMessage() {
    setMessage('');
    setMessageTone('error');
  }

  function showError(nextMessage: string) {
    setMessage(nextMessage);
    setMessageTone('error');
  }

  function showSuccess(nextMessage: string) {
    setMessage(nextMessage);
    setMessageTone('success');
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-label="登录注册">
        <p className="auth-kicker">PRIVATE DIARY</p>
        <h1>进入我的日记</h1>
        <div className="auth-tabs" aria-label="认证方式">
          <button className={mode === 'login' ? 'active' : ''} type="button" onClick={() => switchMode('login')}>
            登录
          </button>
          <button className={mode === 'register' ? 'active' : ''} type="button" onClick={() => switchMode('register')}>
            注册
          </button>
        </div>
        <form onSubmit={submit} className="auth-form">
          <label>
            邮箱
            <input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
          </label>
          <label>
            {mode === 'forgot' ? '新密码' : '密码'}
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </label>
          {(mode === 'register' || mode === 'forgot') && (
            <label>
              {mode === 'forgot' ? '确认新密码' : '确认密码'}
              <input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" autoComplete="new-password" />
            </label>
          )}
          {message && <p className={messageTone === 'success' ? 'auth-success' : 'auth-error'}>{message}</p>}
          <button className="auth-submit" type="submit" disabled={loading}>
            {submitLabel(mode)}
          </button>
        </form>
        {mode === 'login' ? (
          <button type="button" onClick={() => switchMode('forgot')}>
            忘记密码
          </button>
        ) : (
          <button type="button" onClick={() => switchMode('login')}>
            返回登录
          </button>
        )}
        <button className="preview-button" type="button" onClick={onPreview}>
          本地预览
        </button>
      </section>
    </main>
  );
}

function submitLabel(mode: AuthMode) {
  if (mode === 'register') {
    return '创建账号';
  }
  if (mode === 'forgot') {
    return '重置密码';
  }
  return '进入日记';
}

function authErrorMessage(mode: AuthMode, error: unknown) {
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
  if (mode === 'forgot') {
    if (code === 'invalid_credentials') {
      return '邮箱格式不正确，密码至少需要 6 位';
    }
    if (code === 'email_not_found') {
      return '这个邮箱还没有注册';
    }
  }
  return '服务暂时不可用，请稍后再试';
}
