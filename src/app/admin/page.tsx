'use client';

import { useEffect, useState, FormEvent } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Plus, Pencil, Trash2, KeyRound,
  ToggleLeft, ToggleRight, Shield, User, X, Check,
} from 'lucide-react';
import { SECTORS } from '@/lib/sectors';

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
          className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 disabled:opacity-50"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          disabled={isEdit}
          required={!isEdit}
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

  async function updateUser(id: number, data: Partial<{ name: string; departments: string[]; role: string; is_active: boolean; password: string }>) {
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
        <div className="max-w-screen-lg mx-auto px-6 py-3 flex items-center gap-4">
          <Link href="/" className="text-orange-100 hover:text-white transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <Shield size={16} className="text-orange-200" />
          <h1 className="text-base font-bold text-white">Gerenciamento de Usuários</h1>
          <div className="ml-auto">
            <button
              onClick={() => setModal('create')}
              className="flex items-center gap-2 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus size={14} />
              Novo usuário
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-screen-lg mx-auto px-6 py-6">
        {/* Feedback toast */}
        {feedback && (
          <div className="mb-4 flex items-center gap-2 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 text-green-800 dark:text-green-300 px-4 py-2 rounded-lg text-sm">
            <Check size={14} />
            {feedback}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Carregando…</div>
        ) : (
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
