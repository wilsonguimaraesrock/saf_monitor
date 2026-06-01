'use client';

import React, { useEffect, useState, FormEvent } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Plus, Pencil, Trash2, KeyRound,
  ToggleLeft, ToggleRight, Shield, User, X, Check,
  BookOpen, Bot, Users, Phone, Loader2, ChevronDown, ChevronUp,
} from 'lucide-react';
import { SECTORS } from '@/lib/sectors';

type Tab = 'users' | 'knowledge' | 'bot';

// ── Shared types ──────────────────────────────────────────────

interface ArticleRow {
  id: number;
  title: string;
  content: string;
  category: string;
  department: string;
  is_active: boolean;
  created_at: string;
}

interface BotSettings {
  testPhoneNumbers: string[];
  enabledDepartments: string[];
  systemPrompt: string;
}

interface UserRow {
  id: number;
  email: string;
  name: string;
  role: 'superadmin' | 'user';
  departments: string[];
  is_active: boolean;
  created_at: string;
}

// All unique departments from all sectors
const ALL_DEPARTMENTS = Array.from(
  new Set(SECTORS.flatMap((s) => s.departments))
).sort();

const SECTOR_LABELS: Record<string, string> = Object.fromEntries(
  SECTORS.flatMap((s) => s.departments.map((d) => [d, s.name]))
);

// ── Modal ──────────────────────────────────────────────────────

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

function Modal({ title, onClose, children }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-700">
          <h2 className="font-semibold text-gray-900 dark:text-slate-100">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  );
}

// ── User Form ──────────────────────────────────────────────────

interface UserFormData {
  name: string;
  email: string;
  password: string;
  role: 'superadmin' | 'user';
  departments: string[];
}

interface UserFormProps {
  initial?: Partial<UserFormData>;
  isEdit?: boolean;
  onSubmit: (data: UserFormData) => Promise<void>;
  onClose: () => void;
}

function UserForm({ initial, isEdit, onSubmit, onClose }: UserFormProps) {
  const [form, setForm] = useState<UserFormData>({
    name:        initial?.name        ?? '',
    email:       initial?.email       ?? '',
    password:    '',
    role:        initial?.role        ?? 'user',
    departments: initial?.departments ?? [],
  });
  const [saving, setSaving]   = useState(false);
  const [error,  setError]    = useState('');

  function toggleDept(dept: string) {
    setForm((f) => ({
      ...f,
      departments: f.departments.includes(dept)
        ? f.departments.filter((d) => d !== dept)
        : [...f.departments, dept],
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await onSubmit(form);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">Nome</label>
        <input
          className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          required
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">Email</label>
        <input
          type="email"
          className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          required
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">
          {isEdit ? 'Nova senha (deixe em branco para manter)' : 'Senha'}
        </label>
        <input
          type="password"
          className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100"
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          required={!isEdit}
          minLength={6}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">Função</label>
        <select
          className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100"
          value={form.role}
          onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as 'superadmin' | 'user' }))}
        >
          <option value="user">Usuário</option>
          <option value="superadmin">Super Admin</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-2">
          Departamentos designados
        </label>
        <div className="grid grid-cols-1 gap-1 max-h-48 overflow-y-auto border border-gray-200 dark:border-slate-700 rounded-lg p-2">
          {ALL_DEPARTMENTS.map((dept) => (
            <label key={dept} className="flex items-center gap-2 cursor-pointer px-2 py-1 rounded hover:bg-gray-50 dark:hover:bg-slate-800">
              <input
                type="checkbox"
                checked={form.departments.includes(dept)}
                onChange={() => toggleDept(dept)}
                className="accent-orange-500"
              />
              <span className="text-xs text-gray-700 dark:text-slate-300">{dept}</span>
              <span className="ml-auto text-xs text-gray-400 dark:text-slate-500">{SECTOR_LABELS[dept]}</span>
            </label>
          ))}
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800">
          Cancelar
        </button>
        <button type="submit" disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-orange-600 text-white font-medium hover:bg-orange-700 disabled:opacity-50">
          {saving ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Criar usuário'}
        </button>
      </div>
    </form>
  );
}

// ── Main Page ──────────────────────────────────────────────────

export default function AdminPage() {
  const [activeTab,  setActiveTab]  = useState<Tab>('users');
  const [users,      setUsers]      = useState<UserRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [modal,      setModal]      = useState<'create' | { edit: UserRow } | { pwd: UserRow } | null>(null);
  const [confirm,    setConfirm]    = useState<UserRow | null>(null);
  const [feedback,   setFeedback]   = useState('');

  async function load() {
    setLoading(true);
    const res = await fetch('/api/admin/users');
    if (res.ok) {
      const data = await res.json() as { users: UserRow[] };
      setUsers(data.users);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function flash(msg: string) {
    setFeedback(msg);
    setTimeout(() => setFeedback(''), 3000);
  }

  async function createUser(data: { name: string; email: string; password: string; role: string; departments: string[] }) {
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const j = await res.json() as { error: string };
      throw new Error(j.error);
    }
    setModal(null);
    flash('Usuário criado com sucesso');
    await load();
  }

  async function updateUser(id: number, data: Partial<{ email: string; name: string; departments: string[]; role: string; is_active: boolean; password: string }>) {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const j = await res.json() as { error: string };
      throw new Error(j.error);
    }
    setModal(null);
    flash('Usuário atualizado');
    await load();
  }

  async function deleteUser(id: number) {
    await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    setConfirm(null);
    flash('Usuário removido');
    await load();
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-gradient-to-r from-orange-600 to-amber-600 border-b border-orange-700 dark:from-slate-900 dark:to-slate-900 dark:border-slate-800">
        <div className="max-w-screen-xl mx-auto px-6 py-3 flex items-center gap-4">
          <Link href="/" className="text-orange-100 hover:text-white transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <Shield size={16} className="text-orange-200" />
          <h1 className="text-base font-bold text-white">Painel Super Admin</h1>
          <div className="ml-auto">
            {activeTab === 'users' && (
              <button
                onClick={() => setModal('create')}
                className="flex items-center gap-2 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Plus size={14} />
                Novo usuário
              </button>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="max-w-screen-xl mx-auto px-6 flex gap-1 pb-0">
          {([
            { id: 'users',     label: 'Usuários',          icon: Users    },
            { id: 'knowledge', label: 'Base de Conhecimento', icon: BookOpen },
            { id: 'bot',       label: 'Bot WhatsApp',       icon: Bot      },
          ] as { id: Tab; label: string; icon: React.ElementType }[]).map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === t.id
                  ? 'bg-white dark:bg-slate-950 text-gray-900 dark:text-slate-100'
                  : 'text-orange-100 dark:text-slate-400 hover:text-white hover:bg-white/10'
              }`}
            >
              <t.icon size={13} />
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="max-w-screen-xl mx-auto px-6 py-6">
        {/* Feedback toast */}
        {feedback && (
          <div className="mb-4 flex items-center gap-2 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 text-green-800 dark:text-green-300 px-4 py-2 rounded-lg text-sm">
            <Check size={14} />
            {feedback}
          </div>
        )}

        {/* Tab: Knowledge Base */}
        {activeTab === 'knowledge' && <KnowledgeTab />}

        {/* Tab: Bot Settings */}
        {activeTab === 'bot' && <BotTab />}

        {/* Tab: Users */}
        {activeTab === 'users' && loading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Carregando…</div>
        ) : activeTab === 'users' && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-slate-700 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Usuário</th>
                  <th className="px-4 py-3 text-left">Função</th>
                  <th className="px-4 py-3 text-left hidden sm:table-cell">Departamentos</th>
                  <th className="px-4 py-3 text-center">Ativo</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b last:border-0 border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-slate-100">{u.name}</div>
                      <div className="text-xs text-gray-500 dark:text-slate-400">{u.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      {u.role === 'superadmin' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300">
                          <Shield size={10} /> Super Admin
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300">
                          <User size={10} /> Usuário
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {u.departments.length === 0 ? (
                        <span className="text-xs text-gray-400 dark:text-slate-500">Todos</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {u.departments.slice(0, 3).map((d) => (
                            <span key={d} className="px-1.5 py-0.5 rounded text-xs bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300">
                              {d}
                            </span>
                          ))}
                          {u.departments.length > 3 && (
                            <span className="px-1.5 py-0.5 rounded text-xs bg-gray-100 dark:bg-slate-700 text-gray-500">
                              +{u.departments.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => updateUser(u.id, { is_active: !u.is_active })}
                        className={u.is_active ? 'text-green-500 hover:text-green-700' : 'text-gray-400 hover:text-gray-600'}
                        title={u.is_active ? 'Desativar usuário' : 'Ativar usuário'}
                      >
                        {u.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setModal({ edit: u })}
                          className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-slate-200"
                          title="Editar"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setModal({ pwd: u })}
                          className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-slate-200"
                          title="Alterar senha"
                        >
                          <KeyRound size={14} />
                        </button>
                        <button
                          onClick={() => setConfirm(u)}
                          className="p-1 text-gray-400 hover:text-red-600"
                          title="Remover"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create modal */}
      {modal === 'create' && (
        <Modal title="Novo usuário" onClose={() => setModal(null)}>
          <UserForm onSubmit={createUser} onClose={() => setModal(null)} />
        </Modal>
      )}

      {/* Edit modal */}
      {modal !== null && modal !== 'create' && 'edit' in modal && (
        <Modal title="Editar usuário" onClose={() => setModal(null)}>
          <UserForm
            isEdit
            initial={modal.edit}
            onSubmit={(data) => updateUser(modal.edit.id, {
              email: data.email,
              name: data.name,
              departments: data.departments,
              role: data.role,
              ...(data.password ? { password: data.password } : {}),
            })}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}

      {/* Change password modal */}
      {modal !== null && modal !== 'create' && 'pwd' in modal && (
        <Modal title={`Alterar senha — ${modal.pwd.name}`} onClose={() => setModal(null)}>
          <PasswordForm
            onSubmit={(pwd) => updateUser(modal.pwd.id, { password: pwd })}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}

      {/* Delete confirm */}
      {confirm && (
        <Modal title="Confirmar remoção" onClose={() => setConfirm(null)}>
          <p className="text-sm text-gray-700 dark:text-slate-300 mb-4">
            Remover o usuário <strong>{confirm.name}</strong> ({confirm.email})?
            Esta ação não pode ser desfeita.
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setConfirm(null)} className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300">
              Cancelar
            </button>
            <button onClick={() => deleteUser(confirm.id)} className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white font-medium hover:bg-red-700">
              Remover
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}

function PasswordForm({ onSubmit, onClose }: { onSubmit: (pwd: string) => Promise<void>; onClose: () => void }) {
  const [pwd,     setPwd]     = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (pwd !== confirm) { setError('As senhas não coincidem'); return; }
    if (pwd.length < 6)  { setError('Mínimo 6 caracteres'); return; }
    setSaving(true);
    try {
      await onSubmit(pwd);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">Nova senha</label>
        <input type="password" className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm" value={pwd} onChange={(e) => setPwd(e.target.value)} required minLength={6} />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">Confirmar senha</label>
        <input type="password" className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300">Cancelar</button>
        <button type="submit" disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-orange-600 text-white font-medium hover:bg-orange-700 disabled:opacity-50">{saving ? 'Salvando…' : 'Alterar senha'}</button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────
// KNOWLEDGE BASE TAB
// ─────────────────────────────────────────────────────────────

const SECTOR_OPTIONS = [
  { value: 'global', label: '🌐 Global (todos os setores)' },
  ...SECTORS.filter((s) => s.slug !== 'geral').map((s) => ({
    value: s.slug,
    label: `${s.name}`,
  })),
];

function KnowledgeTab() {
  const [articles,   setArticles]   = useState<ArticleRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [deptFilter, setDeptFilter] = useState('');
  const [showForm,   setShowForm]   = useState(false);
  const [editing,    setEditing]    = useState<ArticleRow | null>(null);
  const [confirm,    setConfirm]    = useState<ArticleRow | null>(null);
  const [expanded,   setExpanded]   = useState<number | null>(null);

  async function load() {
    setLoading(true);
    const qs = deptFilter ? `?department=${deptFilter}` : '';
    const res = await fetch(`/api/admin/knowledge${qs}`);
    if (res.ok) {
      const d = await res.json() as { articles: ArticleRow[] };
      setArticles(d.articles);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [deptFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function deleteArticle(id: number) {
    await fetch(`/api/admin/knowledge/${id}`, { method: 'DELETE' });
    setConfirm(null);
    await load();
  }

  async function toggleActive(a: ArticleRow) {
    await fetch(`/api/admin/knowledge/${a.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !a.is_active }),
    });
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100"
        >
          <option value="">Todos os departamentos</option>
          {SECTOR_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="flex items-center gap-2 px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg"
        >
          <Plus size={14} /> Novo artigo
        </button>
      </div>

      {showForm && (
        <ArticleForm
          initial={editing ?? undefined}
          onSave={async () => { setShowForm(false); setEditing(null); await load(); }}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      {loading ? (
        <div className="flex items-center justify-center h-32 text-gray-400 text-sm"><Loader2 size={16} className="animate-spin mr-2" /> Carregando…</div>
      ) : articles.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">Nenhum artigo cadastrado. Clique em &ldquo;Novo artigo&rdquo; para começar.</div>
      ) : (
        <div className="space-y-2">
          {articles.map((a) => (
            <div key={a.id} className={`bg-white dark:bg-slate-900 rounded-xl border ${a.is_active ? 'border-gray-200 dark:border-slate-700' : 'border-dashed border-gray-300 dark:border-slate-600 opacity-60'}`}>
              <div className="flex items-start gap-3 px-4 py-3">
                <button onClick={() => setExpanded(expanded === a.id ? null : a.id)} className="mt-0.5 text-gray-400 hover:text-gray-600 shrink-0">
                  {expanded === a.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-gray-900 dark:text-slate-100">{a.title}</span>
                    <span className="px-1.5 py-0.5 rounded text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">
                      {SECTOR_OPTIONS.find((o) => o.value === a.department)?.label ?? a.department}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-xs bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400">{a.category}</span>
                  </div>
                  {expanded === a.id && (
                    <p className="mt-2 text-xs text-gray-600 dark:text-slate-400 whitespace-pre-wrap leading-relaxed">{a.content}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => toggleActive(a)} title={a.is_active ? 'Desativar' : 'Ativar'} className={a.is_active ? 'text-green-500' : 'text-gray-400'}>
                    {a.is_active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                  </button>
                  <button onClick={() => { setEditing(a); setShowForm(true); }} className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-slate-200"><Pencil size={13} /></button>
                  <button onClick={() => setConfirm(a)} className="p-1 text-gray-400 hover:text-red-600"><Trash2 size={13} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {confirm && (
        <Modal title="Remover artigo" onClose={() => setConfirm(null)}>
          <p className="text-sm text-gray-700 dark:text-slate-300 mb-4">Remover <strong>{confirm.title}</strong>?</p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setConfirm(null)} className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300">Cancelar</button>
            <button onClick={() => deleteArticle(confirm.id)} className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white font-medium hover:bg-red-700">Remover</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ArticleForm({
  initial, onSave, onClose,
}: { initial?: ArticleRow; onSave: () => Promise<void>; onClose: () => void }) {
  const [form, setForm] = useState({
    title:      initial?.title      ?? '',
    content:    initial?.content    ?? '',
    category:   initial?.category   ?? 'geral',
    department: initial?.department ?? 'global',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const url    = initial ? `/api/admin/knowledge/${initial.id}` : '/api/admin/knowledge';
      const method = initial ? 'PUT' : 'POST';
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const j = await res.json() as { error: string };
        throw new Error(j.error);
      }
      await onSave();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const inputClass = 'w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100';

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-orange-200 dark:border-orange-800 p-5">
      <h3 className="font-semibold text-sm text-gray-900 dark:text-slate-100 mb-4">{initial ? 'Editar artigo' : 'Novo artigo'}</h3>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">Departamento</label>
            <select className={inputClass} value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}>
              {SECTOR_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">Categoria</label>
            <input className={inputClass} value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="ex: processos, horários, valores…" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">Título</label>
          <input className={inputClass} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required placeholder="Título do artigo" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">Conteúdo</label>
          <textarea
            className={`${inputClass} min-h-[140px] resize-y`}
            value={form.content}
            onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            required
            placeholder="Escreva aqui o conteúdo que o bot vai usar para responder…"
          />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        {saving && <p className="text-xs text-orange-600 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Gerando embedding com OpenAI…</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300">Cancelar</button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-orange-600 text-white font-medium hover:bg-orange-700 disabled:opacity-50">
            {saving ? 'Salvando…' : initial ? 'Salvar alterações' : 'Criar artigo'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// BOT WHATSAPP TAB
// ─────────────────────────────────────────────────────────────

function BotTab() {
  const [settings,  setSettings]  = useState<BotSettings | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [newPhone,  setNewPhone]  = useState('');
  const [feedback,  setFeedback]  = useState('');

  async function load() {
    setLoading(true);
    const res = await fetch('/api/admin/bot');
    if (res.ok) setSettings(await res.json() as BotSettings);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function flash(msg: string) { setFeedback(msg); setTimeout(() => setFeedback(''), 3000); }

  async function save(patch: Partial<BotSettings>) {
    setSaving(true);
    await fetch('/api/admin/bot', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    await load();
    setSaving(false);
    flash('Salvo!');
  }

  function toggleDept(slug: string) {
    if (!settings) return;
    const current = settings.enabledDepartments;
    const next = current.includes(slug) ? current.filter((d) => d !== slug) : [...current, slug];
    save({ enabledDepartments: next });
  }

  function addPhone() {
    if (!settings || !newPhone.trim()) return;
    const normalized = newPhone.trim().replace(/\s+/g, '');
    if (settings.testPhoneNumbers.includes(normalized)) return;
    save({ testPhoneNumbers: [...settings.testPhoneNumbers, normalized] });
    setNewPhone('');
  }

  function removePhone(p: string) {
    if (!settings) return;
    save({ testPhoneNumbers: settings.testPhoneNumbers.filter((x) => x !== p) });
  }

  if (loading) return <div className="flex items-center justify-center h-32 text-gray-400 text-sm"><Loader2 size={16} className="animate-spin mr-2" /> Carregando…</div>;
  if (!settings) return null;

  const botSectors = SECTORS.filter((s) => s.chatwoot && s.slug !== 'geral');

  return (
    <div className="space-y-6 max-w-2xl">
      {feedback && (
        <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 text-green-800 dark:text-green-300 px-4 py-2 rounded-lg text-sm">
          <Check size={14} /> {feedback}
        </div>
      )}

      {/* Bot enabled per department */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
        <h3 className="font-semibold text-sm text-gray-900 dark:text-slate-100 mb-1">Bot por departamento</h3>
        <p className="text-xs text-gray-400 dark:text-slate-500 mb-4">Ative o bot de IA apenas nos departamentos desejados.</p>
        <div className="space-y-2">
          {botSectors.map((s) => {
            const active = settings.enabledDepartments.includes(s.slug);
            return (
              <div key={s.slug} className="flex items-center justify-between py-2 border-b last:border-0 border-gray-100 dark:border-slate-800">
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-slate-100">{s.name}</div>
                  <div className="text-xs text-gray-400 dark:text-slate-500">{s.chatwoot?.inboxName}</div>
                </div>
                <button onClick={() => toggleDept(s.slug)} className={active ? 'text-green-500' : 'text-gray-400'} disabled={saving}>
                  {active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Test phone numbers */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
        <h3 className="font-semibold text-sm text-gray-900 dark:text-slate-100 mb-1 flex items-center gap-2"><Phone size={14} /> Números de teste</h3>
        <p className="text-xs text-gray-400 dark:text-slate-500 mb-4">
          O bot só responde a esses números. Deixe em branco para responder a todos os números dos departamentos ativos.
        </p>
        <div className="flex gap-2 mb-3">
          <input
            className="flex-1 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100"
            placeholder="+5511999999999"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addPhone()}
          />
          <button onClick={addPhone} className="px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg"><Plus size={14} /></button>
        </div>
        {settings.testPhoneNumbers.length === 0 ? (
          <p className="text-xs text-gray-400 italic">Nenhum número de teste — bot responde a todos.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {settings.testPhoneNumbers.map((p) => (
              <span key={p} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300">
                <Phone size={10} /> {p}
                <button onClick={() => removePhone(p)} className="text-gray-400 hover:text-red-500"><X size={10} /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* System prompt */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
        <h3 className="font-semibold text-sm text-gray-900 dark:text-slate-100 mb-1">Prompt do sistema</h3>
        <p className="text-xs text-gray-400 dark:text-slate-500 mb-3">Instrução base do bot. A base de conhecimento relevante é adicionada automaticamente.</p>
        <textarea
          className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 min-h-[100px] resize-y"
          value={settings.systemPrompt}
          onChange={(e) => setSettings((s) => s ? { ...s, systemPrompt: e.target.value } : s)}
        />
        <div className="flex justify-end mt-2">
          <button
            onClick={() => save({ systemPrompt: settings.systemPrompt })}
            disabled={saving}
            className="px-4 py-2 text-sm rounded-lg bg-orange-600 text-white font-medium hover:bg-orange-700 disabled:opacity-50"
          >
            {saving ? 'Salvando…' : 'Salvar prompt'}
          </button>
        </div>
      </div>

      {/* Setup instructions */}
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-xs text-blue-800 dark:text-blue-300 space-y-1">
        <p className="font-semibold">Configuração do webhook no Chatwoot:</p>
        <p>Settings → Integrations → Webhooks → New Webhook</p>
        <p className="font-mono bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded mt-1">
          {typeof window !== 'undefined' ? window.location.origin : 'https://seu-dominio.vercel.app'}/api/webhooks/chatwoot
        </p>
        <p className="mt-1">Eventos: <strong>message_created</strong></p>
        <p>Após criar os artigos, rode novamente <code>/api/cron/migrate</code> para criar as tabelas novas.</p>
      </div>
    </div>
  );
}
