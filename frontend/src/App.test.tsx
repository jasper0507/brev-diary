import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('./crypto', () => ({
  deriveDiaryKey: vi.fn(async () => 'test-key'),
  exportDiaryKey: vi.fn(async () => 'raw-test-key'),
  importDiaryKey: vi.fn(async () => 'test-key'),
  encryptJSON: vi.fn(async (_key: unknown, value: unknown) => ({
    encryptedPayload: JSON.stringify(value),
    nonce: 'test-nonce'
  })),
  decryptJSON: vi.fn(async (_key: unknown, payload: { encryptedPayload: string }) => JSON.parse(payload.encryptedPayload))
}));

async function openPreview() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: '本地预览' }));
  return user;
}

function storedSession(expiresAt = Date.now() + 100000) {
  return {
    token: 'token-123',
    email: 'me@example.com',
    rawKey: 'raw-test-key',
    expiresAt
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('diary interface', () => {
  it('starts from an auth screen and can enter local preview', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole('heading', { name: '进入我的日记' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '我的日记' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '本地预览' }));

    expect(screen.getByRole('heading', { name: '我的日记' })).toBeInTheDocument();
  });

  it('keeps local preview isolated from backend APIs and shows settings content', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    render(<App />);

    await user.click(screen.getByRole('button', { name: '本地预览' }));
    await user.click(screen.getByRole('button', { name: '设置' }));

    expect(screen.getByRole('heading', { name: '我的日记' })).toBeInTheDocument();
    expect(screen.getByText('本地预览模式')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('registers through the API envelope without a second login request', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const path = input.toString();
      if (path === '/api/auth/register') {
        return { ok: true, json: async () => ({ data: { token: 'token-123', user: { email: 'me@example.com', diaryKey: 'raw-test-key' } }, error: null }) } as Response;
      }
      if (path === '/api/entries') {
        return { ok: true, json: async () => ({ data: [], error: null }) } as Response;
      }
      throw new Error(`unexpected fetch ${path}`);
    });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '注册' }));
    await user.type(screen.getByLabelText('邮箱'), 'me@example.com');
    await user.type(screen.getByLabelText('密码'), 'secret123');
    await user.type(screen.getByLabelText('确认密码'), 'secret123');
    await user.click(screen.getByRole('button', { name: '创建账号' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/register', expect.objectContaining({ method: 'POST' }));
    expect(fetchMock).not.toHaveBeenCalledWith('/api/auth/login', expect.anything());
    expect(JSON.parse(localStorage.getItem('diary.session') ?? '{}')).toEqual(expect.objectContaining({ token: 'token-123', rawKey: 'raw-test-key' }));
    expect(await screen.findByRole('heading', { name: '我的日记' })).toBeInTheDocument();
  });

  it('blocks registration when the confirmation password does not match', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    render(<App />);

    await user.click(screen.getByRole('button', { name: '注册' }));
    await user.type(screen.getByLabelText('邮箱'), 'me@example.com');
    await user.type(screen.getByLabelText('密码'), 'secret123');
    await user.type(screen.getByLabelText('确认密码'), 'secret456');
    await user.click(screen.getByRole('button', { name: '创建账号' }));

    expect(screen.getByText('两次输入的密码不一致')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows a specific message when registration input is invalid', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const path = input.toString();
      if (path === '/api/auth/register') {
        return { ok: false, json: async () => ({ data: null, error: { code: 'invalid_credentials' } }) } as Response;
      }
      throw new Error(`unexpected fetch ${path}`);
    });

    render(<App />);

    await user.click(screen.getByRole('button', { name: '注册' }));
    await user.type(screen.getByLabelText('邮箱'), 'bad-email');
    await user.type(screen.getByLabelText('密码'), '123');
    await user.type(screen.getByLabelText('确认密码'), '123');
    await user.click(screen.getByRole('button', { name: '创建账号' }));

    expect(await screen.findByText('邮箱格式不正确，密码至少需要 6 位')).toBeInTheDocument();
  });

  it('shows a specific message when the email is already registered', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const path = input.toString();
      if (path === '/api/auth/register') {
        return { ok: false, json: async () => ({ data: null, error: { code: 'email_exists' } }) } as Response;
      }
      throw new Error(`unexpected fetch ${path}`);
    });

    render(<App />);

    await user.click(screen.getByRole('button', { name: '注册' }));
    await user.type(screen.getByLabelText('邮箱'), 'me@example.com');
    await user.type(screen.getByLabelText('密码'), 'secret123');
    await user.type(screen.getByLabelText('确认密码'), 'secret123');
    await user.click(screen.getByRole('button', { name: '创建账号' }));

    expect(await screen.findByText('这个邮箱已经注册')).toBeInTheDocument();
  });

  it('shows a specific message when login credentials are invalid', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const path = input.toString();
      if (path === '/api/auth/login') {
        return { ok: false, json: async () => ({ data: null, error: { code: 'invalid_credentials' } }) } as Response;
      }
      throw new Error(`unexpected fetch ${path}`);
    });

    render(<App />);

    await user.type(screen.getByLabelText('邮箱'), 'me@example.com');
    await user.type(screen.getByLabelText('密码'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: '进入日记' }));

    expect(await screen.findByText('邮箱或密码错误')).toBeInTheDocument();
  });

  it('resets the password from the forgot-password form and returns to login', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const path = input.toString();
      if (path === '/api/auth/forgot-password') {
        return { ok: true, json: async () => ({ data: { email: 'me@example.com', diaryKey: 'raw-test-key' }, error: null }) } as Response;
      }
      throw new Error(`unexpected fetch ${path}`);
    });

    render(<App />);

    await user.click(screen.getByRole('button', { name: '忘记密码' }));
    await user.type(screen.getByLabelText('邮箱'), 'me@example.com');
    await user.type(screen.getByLabelText('新密码'), 'new-secret');
    await user.type(screen.getByLabelText('确认新密码'), 'new-secret');
    await user.click(screen.getByRole('button', { name: '重置密码' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/forgot-password', expect.objectContaining({ method: 'POST' }));
    expect(await screen.findByText('密码已重置，请重新登录')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '进入日记' })).toBeInTheDocument();
  });

  it('opens the password reset flow from settings with the current email prefilled', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = input.toString();
      if (path === '/api/auth/login') {
        return { ok: true, json: async () => ({ data: { token: 'token-123', user: { email: 'me@example.com', diaryKey: 'raw-test-key' } }, error: null }) } as Response;
      }
      if (path === '/api/entries' && !init?.method) {
        return { ok: true, json: async () => ({ data: [], error: null }) } as Response;
      }
      if (path === '/api/auth/forgot-password') {
        return { ok: true, json: async () => ({ data: { email: 'me@example.com', diaryKey: 'raw-test-key' }, error: null }) } as Response;
      }
      throw new Error(`unexpected fetch ${path}`);
    });

    render(<App />);

    await user.type(screen.getByLabelText('邮箱'), 'me@example.com');
    await user.type(screen.getByLabelText('密码'), 'secret123');
    await user.click(screen.getByRole('button', { name: '进入日记' }));
    await screen.findByRole('heading', { name: '我的日记' });

    await user.click(screen.getByRole('button', { name: '设置' }));
    await user.click(screen.getByRole('button', { name: '修改密码' }));

    expect(await screen.findByRole('heading', { name: '进入我的日记' })).toBeInTheDocument();
    expect(screen.getByLabelText('邮箱')).toHaveValue('me@example.com');
    expect(screen.getByLabelText('新密码')).toBeInTheDocument();

    await user.type(screen.getByLabelText('新密码'), 'new-secret');
    await user.type(screen.getByLabelText('确认新密码'), 'new-secret');
    await user.click(screen.getByRole('button', { name: '重置密码' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/forgot-password', expect.objectContaining({ method: 'POST' }));
    expect(await screen.findByText('密码已重置，请重新登录')).toBeInTheDocument();
  });

  it('loads encrypted diary entries from the API after login', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const path = input.toString();
      if (path === '/api/auth/login') {
        return { ok: true, json: async () => ({ data: { token: 'token-123', user: { email: 'me@example.com', diaryKey: 'raw-test-key' } }, error: null }) } as Response;
      }
      if (path === '/api/entries') {
        return {
          ok: true,
          json: async () => ({
            data: [{ id: 42, entryDate: '2026-04-26', encryptedPayload: JSON.stringify({ mood: '感恩', favorite: true, text: '来自后端的加密日记', images: [] }), nonce: 'test-nonce', version: 1 }],
            error: null
          })
        } as Response;
      }
      throw new Error(`unexpected fetch ${path}`);
    });

    render(<App />);

    await user.type(screen.getByLabelText('邮箱'), 'me@example.com');
    await user.type(screen.getByLabelText('密码'), 'secret123');
    await user.click(screen.getByRole('button', { name: '进入日记' }));

    expect(await screen.findByText('4月26日')).toBeInTheDocument();
    expect(screen.getByText('感恩')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/entries', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer token-123' })
    }));
  });

  it('encrypts and saves a new diary entry through the API after login', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = input.toString();
      if (path === '/api/auth/login') {
        return { ok: true, json: async () => ({ data: { token: 'token-123', user: { email: 'me@example.com', diaryKey: 'raw-test-key' } }, error: null }) } as Response;
      }
      if (path === '/api/entries' && !init?.method) {
        return { ok: true, json: async () => ({ data: [], error: null }) } as Response;
      }
      if (path === '/api/entries' && init?.method === 'POST') {
        const body = JSON.parse(init.body as string);
        return { ok: true, json: async () => ({ data: { id: 100, entryDate: body.entryDate, encryptedPayload: body.encryptedPayload, nonce: body.nonce, version: 1 }, error: null }) } as Response;
      }
      throw new Error(`unexpected fetch ${path}`);
    });

    render(<App />);

    await user.type(screen.getByLabelText('邮箱'), 'me@example.com');
    await user.type(screen.getByLabelText('密码'), 'secret123');
    await user.click(screen.getByRole('button', { name: '进入日记' }));
    await screen.findByText('还没有日记，点右下角开始写第一篇');

    await user.click(screen.getByRole('button', { name: '写今日日记' }));
    await user.type(screen.getByLabelText('日记正文'), '今天接入真实后端');
    await user.click(screen.getByRole('button', { name: '保存' }));
    await user.click(within(screen.getByRole('dialog', { name: '选择心情' })).getByRole('button', { name: '平静' }));

    expect(await screen.findByText('已保存')).toBeInTheDocument();
    const createCall = fetchMock.mock.calls.find(([path, init]) => path === '/api/entries' && init?.method === 'POST');
    const body = JSON.parse(createCall?.[1]?.body as string);
    expect(body).toEqual(expect.objectContaining({
      entryDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      encryptedPayload: expect.stringContaining('今天接入真实后端'),
      nonce: 'test-nonce'
    }));
    expect(JSON.parse(body.encryptedPayload)).toEqual(expect.objectContaining({
      mood: '平静',
      favorite: false,
      text: '今天接入真实后端',
      images: []
    }));
  });

  it('updates an existing real diary entry through the API', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = input.toString();
      if (path === '/api/auth/login') {
        return { ok: true, json: async () => ({ data: { token: 'token-123', user: { email: 'me@example.com', diaryKey: 'raw-test-key' } }, error: null }) } as Response;
      }
      if (path === '/api/entries' && !init?.method) {
        return { ok: true, json: async () => ({ data: [{ id: 42, entryDate: '2026-04-26', encryptedPayload: JSON.stringify({ mood: '感恩', favorite: false, text: '旧内容', images: [] }), nonce: 'test-nonce', version: 3 }], error: null }) } as Response;
      }
      if (path === '/api/entries/42' && init?.method === 'PUT') {
        const body = JSON.parse(init.body as string);
        return { ok: true, json: async () => ({ data: { id: 42, entryDate: body.entryDate, encryptedPayload: body.encryptedPayload, nonce: body.nonce, version: 4 }, error: null }) } as Response;
      }
      throw new Error(`unexpected fetch ${path}`);
    });

    render(<App />);
    await user.type(screen.getByLabelText('邮箱'), 'me@example.com');
    await user.type(screen.getByLabelText('密码'), 'secret123');
    await user.click(screen.getByRole('button', { name: '进入日记' }));
    await user.click(await screen.findByRole('button', { name: /打开 4月26日/ }));
    await user.type(screen.getByLabelText('日记正文'), '更新');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/entries/42', expect.objectContaining({ method: 'PUT' }));
    const updateCall = fetchMock.mock.calls.find(([path, init]) => path === '/api/entries/42' && init?.method === 'PUT');
    expect(JSON.parse(updateCall?.[1]?.body as string)).toEqual(expect.objectContaining({ version: 3 }));
  });

  it('keeps the draft and shows a conflict notice when save fails with version conflict', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = input.toString();
      if (path === '/api/auth/login') {
        return { ok: true, json: async () => ({ data: { token: 'token-123', user: { email: 'me@example.com', diaryKey: 'raw-test-key' } }, error: null }) } as Response;
      }
      if (path === '/api/entries' && !init?.method) {
        return { ok: true, json: async () => ({ data: [{ id: 42, entryDate: '2026-04-26', encryptedPayload: JSON.stringify({ mood: '感恩', favorite: false, text: '旧内容', images: [] }), nonce: 'test-nonce', version: 3 }], error: null }) } as Response;
      }
      if (path === '/api/entries/42' && init?.method === 'PUT') {
        return { ok: false, json: async () => ({ data: null, error: { code: 'version_conflict' } }) } as Response;
      }
      throw new Error(`unexpected fetch ${path}`);
    });

    render(<App />);
    await user.type(screen.getByLabelText('邮箱'), 'me@example.com');
    await user.type(screen.getByLabelText('密码'), 'secret123');
    await user.click(screen.getByRole('button', { name: '进入日记' }));
    await user.click(await screen.findByRole('button', { name: /打开 4月26日/ }));
    await user.type(screen.getByLabelText('日记正文'), '保留草稿');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('版本冲突，请返回后重新打开这篇日记')).toBeInTheDocument();
    expect(screen.getByLabelText('日记正文')).toHaveValue('旧内容保留草稿');
  });

  it('restores a valid 7-day local session and loads diary entries without login', async () => {
    localStorage.setItem('diary.session', JSON.stringify(storedSession()));
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ data: [], error: null }) } as Response);

    render(<App />);

    expect(await screen.findByRole('heading', { name: '我的日记' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '进入我的日记' })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/entries', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer token-123' })
    }));
  });

  it('clears an expired local session and returns to login', () => {
    localStorage.setItem('diary.session', JSON.stringify(storedSession(Date.now() - 1)));

    render(<App />);

    expect(screen.getByRole('heading', { name: '进入我的日记' })).toBeInTheDocument();
    expect(localStorage.getItem('diary.session')).toBeNull();
  });

  it('logs out and clears the persisted session', async () => {
    const user = userEvent.setup();
    localStorage.setItem('diary.session', JSON.stringify(storedSession()));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ data: [], error: null }) } as Response);

    render(<App />);

    await screen.findByRole('heading', { name: '我的日记' });
    await user.click(screen.getByRole('button', { name: '设置' }));
    await user.click(screen.getByRole('button', { name: '退出登录' }));

    expect(localStorage.getItem('diary.session')).toBeNull();
    expect(screen.getByRole('heading', { name: '进入我的日记' })).toBeInTheDocument();
  });

  it('opens and cancels the delete confirmation without deleting', async () => {
    const user = await openPreview();

    fireEvent.contextMenu(screen.getByRole('button', { name: /打开 5月20日/ }));

    const dialog = screen.getByRole('dialog', { name: '删除日记' });
    expect(within(dialog).getByText('确定删除 5月20日 的日记吗？删除后可在回收站恢复。')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '取消' }));

    expect(screen.getByText('5月20日')).toBeInTheDocument();
  });

  it('soft deletes a real entry from the timeline after long-press confirmation', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = input.toString();
      if (path === '/api/auth/login') {
        return { ok: true, json: async () => ({ data: { token: 'token-123', user: { email: 'me@example.com', diaryKey: 'raw-test-key' } }, error: null }) } as Response;
      }
      if (path === '/api/entries' && !init?.method) {
        return { ok: true, json: async () => ({ data: [{ id: 42, entryDate: '2026-04-26', encryptedPayload: JSON.stringify({ mood: '感恩', favorite: false, text: '可删除日记', images: [] }), nonce: 'test-nonce', version: 1 }], error: null }) } as Response;
      }
      if (path === '/api/entries/42' && init?.method === 'DELETE') {
        return { ok: true, json: async () => ({ data: { id: 42, entryDate: '2026-04-26', encryptedPayload: '{}', nonce: 'n', version: 1 }, error: null }) } as Response;
      }
      throw new Error(`unexpected fetch ${path}`);
    });

    render(<App />);
    await user.type(screen.getByLabelText('邮箱'), 'me@example.com');
    await user.type(screen.getByLabelText('密码'), 'secret123');
    await user.click(screen.getByRole('button', { name: '进入日记' }));
    const entryButton = await screen.findByRole('button', { name: /打开 4月26日/ });

    vi.useFakeTimers();
    fireEvent.pointerDown(entryButton);
    act(() => vi.advanceTimersByTime(700));
    fireEvent.pointerUp(entryButton);
    vi.useRealTimers();

    await user.click(within(screen.getByRole('dialog', { name: '删除日记' })).getByRole('button', { name: '删除' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/entries/42', expect.objectContaining({ method: 'DELETE' }));
    await waitFor(() => expect(screen.queryByText('4月26日')).not.toBeInTheDocument());
  });

  it('opens trash, restores entries, and confirms permanent delete', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = input.toString();
      if (path === '/api/auth/login') {
        return { ok: true, json: async () => ({ data: { token: 'token-123', user: { email: 'me@example.com', diaryKey: 'raw-test-key' } }, error: null }) } as Response;
      }
      if (path === '/api/entries' && !init?.method) {
        return { ok: true, json: async () => ({ data: [], error: null }) } as Response;
      }
      if (path === '/api/trash' && !init?.method) {
        return { ok: true, json: async () => ({ data: [{ id: 50, entryDate: '2026-04-20', encryptedPayload: JSON.stringify({ mood: '思考', favorite: false, text: '回收站日记', images: [] }), nonce: 'test-nonce', version: 2, deletedAt: '2026-04-21T00:00:00Z' }], error: null }) } as Response;
      }
      if (path === '/api/entries/50/restore' && init?.method === 'POST') {
        return { ok: true, json: async () => ({ data: { id: 50, entryDate: '2026-04-20', encryptedPayload: JSON.stringify({ mood: '思考', favorite: false, text: '回收站日记', images: [] }), nonce: 'test-nonce', version: 2 }, error: null }) } as Response;
      }
      if (path === '/api/trash/50' && init?.method === 'DELETE') {
        return { ok: true, json: async () => ({ data: { id: 50 }, error: null }) } as Response;
      }
      throw new Error(`unexpected fetch ${path}`);
    });

    render(<App />);
    await user.type(screen.getByLabelText('邮箱'), 'me@example.com');
    await user.type(screen.getByLabelText('密码'), 'secret123');
    await user.click(screen.getByRole('button', { name: '进入日记' }));
    await screen.findByText('还没有日记，点右下角开始写第一篇');
    await user.click(screen.getByRole('button', { name: '设置' }));
    await user.click(screen.getByRole('button', { name: '回收站' }));

    expect(await screen.findByText('4月20日')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '恢复' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/entries/50/restore', expect.objectContaining({ method: 'POST' }));

    await user.click(screen.getByRole('button', { name: '返回' }));
    await user.click(screen.getByRole('button', { name: '设置' }));
    await user.click(screen.getByRole('button', { name: '回收站' }));
    await screen.findByText('4月20日');
    await user.click(screen.getByRole('button', { name: '永久删除' }));
    await user.click(within(screen.getByRole('dialog', { name: '永久删除' })).getByRole('button', { name: '永久删除' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/trash/50', expect.objectContaining({ method: 'DELETE' }));
  });

  it('shows a load failure without leaving the authenticated shell', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const path = input.toString();
      if (path === '/api/auth/login') {
        return { ok: true, json: async () => ({ data: { token: 'token-123', user: { email: 'me@example.com', diaryKey: 'raw-test-key' } }, error: null }) } as Response;
      }
      if (path === '/api/entries') {
        return { ok: false, json: async () => ({ data: null, error: { code: 'server_error' } }) } as Response;
      }
      throw new Error(`unexpected fetch ${path}`);
    });

    render(<App />);
    await user.type(screen.getByLabelText('邮箱'), 'me@example.com');
    await user.type(screen.getByLabelText('密码'), 'secret123');
    await user.click(screen.getByRole('button', { name: '进入日记' }));

    expect((await screen.findAllByText('加载失败，请稍后重试')).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: '我的日记' })).toBeInTheDocument();
  });

  it('matches the quiet timeline home view without diary previews or unselected moods', () => {
    render(<App initialPreview />);

    expect(screen.getByRole('heading', { name: '我的日记' })).toBeInTheDocument();
    expect(screen.getByText('长按日期可删除')).toBeInTheDocument();
    expect(screen.getByText('5月20日')).toBeInTheDocument();
    expect(screen.getByText('周二')).toBeInTheDocument();
    expect(screen.getAllByText('平静').length).toBeGreaterThan(0);
    expect(screen.queryByText('未选')).not.toBeInTheDocument();
    expect(screen.queryByText('整理房间的一天')).not.toBeInTheDocument();
  });

  it('filters the timeline to favorite entries', async () => {
    const user = await openPreview();

    await user.click(screen.getByRole('button', { name: '收藏' }));

    expect(screen.getByText('5月20日')).toBeInTheDocument();
    expect(screen.queryByText('5月19日')).not.toBeInTheDocument();
  });

  it('opens a full-page editor from a timeline node', async () => {
    const user = await openPreview();

    await user.click(screen.getByRole('button', { name: /打开 5月20日/ }));

    expect(screen.getByRole('button', { name: '返回' })).toBeInTheDocument();
    expect(screen.getByText('5.20')).toBeInTheDocument();
    expect(screen.getByText('已保存')).toBeInTheDocument();
    expect(screen.getByLabelText('日记正文')).toBeInTheDocument();
    expect(screen.getByLabelText('无边界纸面编辑区')).toBeInTheDocument();
  });

  it('auto-saves edits after a short pause', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '本地预览' }));
    await user.click(screen.getByRole('button', { name: /打开 5月20日/ }));
    const editor = screen.getByLabelText('日记正文');

    vi.useFakeTimers();
    fireEvent.change(editor, { target: { value: 'auto saved text' } });

    expect(screen.getByText('保存中')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1000));

    expect(screen.getByText('已保存')).toBeInTheDocument();
    vi.useRealTimers();
    await user.click(screen.getByRole('button', { name: '返回' }));
    await user.click(screen.getByRole('button', { name: /打开 5月20日/ }));
    expect(screen.getByLabelText('日记正文')).toHaveValue('auto saved text');
  });

  it('uses a quiet document-like editor body with content blocks', async () => {
    const user = await openPreview();

    await user.click(screen.getByRole('button', { name: /打开 5月20日/ }));

    expect(screen.getByLabelText('日记正文')).toHaveClass('paper-textarea');
    expect(screen.getAllByRole('img', { name: /日记图片/ })).toHaveLength(2);
    expect(screen.getByRole('button', { name: '添加图片（后续版本）' })).toHaveClass('add-image-block');
  });

  it('requires mood selection before saving a new diary entry', async () => {
    const user = await openPreview();

    await user.click(screen.getByRole('button', { name: '写今日日记' }));
    await user.click(screen.getByRole('button', { name: '保存' }));

    const dialog = screen.getByRole('dialog', { name: '选择心情' });
    expect(within(dialog).getByText('保存前选择今天的心情')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '平静' }));

    expect(screen.getByText('已保存')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '返回' }));
    expect(screen.queryByText('未选')).not.toBeInTheDocument();
  });

  it('shows the mood dialog before saving if an editor draft has no mood', async () => {
    const user = await openPreview();

    await user.click(screen.getByRole('button', { name: '写今日日记' }));
    await user.click(screen.getByRole('button', { name: '保存' }));

    const dialog = screen.getByRole('dialog', { name: '选择心情' });
    expect(within(dialog).getByText('保存前选择今天的心情')).toBeInTheDocument();
  });
});
