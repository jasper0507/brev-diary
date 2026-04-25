import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('./crypto', () => ({
  deriveDiaryKey: vi.fn(async () => 'test-key'),
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

  it('registers and logs in through the API envelope', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ data: { token: 'token-123', user: { email: 'me@example.com', kdfSalt: 'salt' } }, error: null })
    } as Response);
    render(<App />);

    await user.click(screen.getByRole('button', { name: '注册' }));
    await user.type(screen.getByLabelText('邮箱'), 'me@example.com');
    await user.type(screen.getByLabelText('密码'), 'secret123');
    await user.click(screen.getByRole('button', { name: '创建账号' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/register', expect.objectContaining({ method: 'POST' }));
    expect(localStorage.getItem('diary.token')).toBe('token-123');
    expect(screen.getByRole('heading', { name: '我的日记' })).toBeInTheDocument();
  });

  it('loads encrypted diary entries from the API after login', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const path = input.toString();
      if (path === '/api/auth/login') {
        return {
          ok: true,
          json: async () => ({ data: { token: 'token-123', user: { email: 'me@example.com', kdfSalt: 'salt' } }, error: null })
        } as Response;
      }
      if (path === '/api/entries') {
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                id: 42,
                entryDate: '2026-04-26',
                encryptedPayload: JSON.stringify({ mood: '感恩', favorite: true, text: '来自后端的加密日记', images: [] }),
                nonce: 'test-nonce',
                version: 1
              }
            ],
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
        return {
          ok: true,
          json: async () => ({ data: { token: 'token-123', user: { email: 'me@example.com', kdfSalt: 'salt' } }, error: null })
        } as Response;
      }
      if (path === '/api/entries' && !init?.method) {
        return { ok: true, json: async () => ({ data: [], error: null }) } as Response;
      }
      if (path === '/api/entries' && init?.method === 'POST') {
        const body = JSON.parse(init.body as string);
        return {
          ok: true,
          json: async () => ({
            data: { id: 100, entryDate: body.entryDate, encryptedPayload: body.encryptedPayload, nonce: body.nonce, version: 1 },
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
    await screen.findByText('还没有日记');

    await user.click(screen.getByRole('button', { name: '写今日日记' }));
    await user.type(screen.getByLabelText('日记正文'), '今天接入真实后端');
    await user.click(screen.getByRole('button', { name: '保存' }));
    await user.click(within(screen.getByRole('dialog', { name: '选择心情' })).getByRole('button', { name: '平静' }));

    expect(await screen.findByText('已保存')).toBeInTheDocument();
    const createCall = fetchMock.mock.calls.find(([path, init]) => path === '/api/entries' && init?.method === 'POST');
    expect(createCall).toBeTruthy();
    const body = JSON.parse(createCall?.[1]?.body as string);
    expect(body).toEqual(expect.objectContaining({
      entryDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      encryptedPayload: expect.stringContaining('今天接入真实后端'),
      nonce: 'test-nonce'
    }));
  });

  it('matches the quiet timeline home view without diary previews or unselected moods', () => {
    render(<App initialPreview />);

    expect(screen.getByRole('heading', { name: '我的日记' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '菜单' })).not.toBeInTheDocument();
    expect(screen.getByText('5月20日')).toBeInTheDocument();
    expect(screen.getByText('周二')).toBeInTheDocument();
    expect(screen.getAllByText('平静').length).toBeGreaterThan(0);
    expect(screen.queryByText('未选')).not.toBeInTheDocument();
    expect(screen.queryByText('整理房间的一天')).not.toBeInTheDocument();
    expect(screen.queryByText(/翻到很多以前的笔记/)).not.toBeInTheDocument();
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
    vi.useRealTimers();
  });

  it('uses a quiet document-like editor body with content blocks', async () => {
    const user = await openPreview();

    await user.click(screen.getByRole('button', { name: /打开 5月20日/ }));

    expect(screen.getByLabelText('日记正文')).toHaveClass('paper-textarea');
    expect(screen.getAllByRole('img', { name: /日记图片/ })).toHaveLength(2);
    expect(screen.getByRole('button', { name: '添加图片' })).toHaveClass('add-image-block');
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
    expect(screen.getByText('5月21日')).toBeInTheDocument();
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
