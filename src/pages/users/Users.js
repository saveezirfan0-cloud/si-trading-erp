// src/pages/users/Users.js
import React, { useEffect, useState, useCallback } from 'react';
import { getAll, create, update, createWithId, COLLECTIONS } from '../../lib/db';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import Header from '../../components/layout/Header';
import { Table, Btn, Modal, Input, Select, Badge, PageHeader, FormGrid, Card, Loader } from '../../components/ui';
import toast from 'react-hot-toast';
import { Plus, Edit2, Shield, Key, RefreshCw, UserCheck, UserX } from 'lucide-react';

const ROLES = [
  { value: 'admin', label: 'Admin', color: 'red', desc: 'Full access — read, write, delete, export, import, manage users' },
  { value: 'manager', label: 'Manager', color: 'yellow', desc: 'Read, write, export, import' },
  { value: 'accountant', label: 'Accountant', color: 'blue', desc: 'Read, write, export accounting modules' },
  { value: 'staff', label: 'Staff', color: 'green', desc: 'Read and write access' },
  { value: 'viewer', label: 'Viewer', color: 'default', desc: 'Read-only access' },
];

export default function Users() {
  const { register, profile, user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Modals
  const [createModal, setCreateModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [pwModal, setPwModal] = useState(false);
  const [editing, setEditing] = useState(null);

  // Forms
  const [createForm, setCreateForm] = useState({ name: '', email: '', password: '', role: 'staff' });
  const [pwForm, setPwForm] = useState({ newPassword: '', confirmPassword: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const firestoreUsers = await getAll(COLLECTIONS.USERS);
      setUsers(firestoreUsers);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load users');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Create user via Firebase Auth + write Firestore doc
  const handleCreate = async () => {
    if (!createForm.name || !createForm.email || !createForm.password) return toast.error('All fields required');
    if (createForm.password.length < 6) return toast.error('Password must be at least 6 characters');
    setSaving(true);
    try {
      await register(createForm.email, createForm.password, createForm.name, createForm.role);
      toast.success(`User "${createForm.name}" created successfully`);
      setCreateModal(false);
      setCreateForm({ name: '', email: '', password: '', role: 'staff' });
      load();
    } catch (e) {
      if (e.code === 'auth/email-already-in-use') toast.error('This email is already registered');
      else if (e.code === 'auth/invalid-email') toast.error('Invalid email address');
      else toast.error(e.message || 'Failed to create user');
    }
    setSaving(false);
  };

  // If an auth user exists but has no profile row, create one
  const handleSyncUser = async (uid, email) => {
    const name = email.split('@')[0];
    await createWithId(COLLECTIONS.USERS, uid, { name, email, role: 'viewer', active: true });
    toast.success('User synced to ERP');
    load();
  };

  // Edit user profile + role
  const handleUpdateUser = async () => {
    if (!editing.name) return toast.error('Name is required');
    setSaving(true);
    try {
      await update(COLLECTIONS.USERS, editing.id, {
        name: editing.name,
        role: editing.role,
        phone: editing.phone || '',
        active: editing.active,
      });
      toast.success('User updated');
      setEditModal(false);
      load();
    } catch (e) { toast.error('Failed: ' + e.message); }
    setSaving(false);
  };

  // Send password reset email
  const handlePasswordReset = async () => {
    if (!editing?.email) return;
    setSaving(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(editing.email);
      if (error) throw error;
      toast.success(`Password reset email sent to ${editing.email}`);
      setPwModal(false);
    } catch (e) { toast.error('Failed: ' + e.message); }
    setSaving(false);
  };

  // Change own password
  const handleChangeOwnPassword = async () => {
    if (!pwForm.newPassword || pwForm.newPassword.length < 6) return toast.error('Password must be at least 6 characters');
    if (pwForm.newPassword !== pwForm.confirmPassword) return toast.error('Passwords do not match');
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwForm.newPassword });
      if (error) throw error;
      toast.success('Password updated successfully');
      setPwModal(false);
      setPwForm({ newPassword: '', confirmPassword: '' });
    } catch (e) {
      if (e.code === 'auth/requires-recent-login') {
        toast.error('Please log out and log back in before changing your password');
      } else {
        toast.error('Failed: ' + e.message);
      }
    }
    setSaving(false);
  };

  const handleToggleActive = async (u) => {
    await update(COLLECTIONS.USERS, u.id, { active: !u.active });
    toast.success(u.active ? 'User deactivated' : 'User activated');
    load();
  };

  const isOwnProfile = (u) => u.email === currentUser?.email;

  const columns = [
    { key: 'name', label: 'User', render: (v, r) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: r.role === 'admin' ? 'var(--red)' : 'var(--accent)',
          color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '0.85rem', flexShrink: 0,
        }}>
          {(v || r.email)?.[0]?.toUpperCase()}
        </div>
        <div>
          <div style={{ fontWeight: 600 }}>{v || '—'}</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>{r.email}</div>
          {r.phone && <div style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>{r.phone}</div>}
        </div>
      </div>
    )},
    { key: 'role', label: 'Role', render: v => {
      const r = ROLES.find(x => x.value === v);
      return <Badge color={r?.color || 'default'}>{v || 'viewer'}</Badge>;
    }},
    { key: 'active', label: 'Status', render: (v, r) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Badge color={v !== false ? 'green' : 'red'}>{v !== false ? 'Active' : 'Inactive'}</Badge>
        {isOwnProfile(r) && <span style={{ fontSize: '10px', color: 'var(--accent)' }}>You</span>}
      </div>
    )},
    { key: '_actions', label: '', render: (_, row) => (
      profile?.role === 'admin' || isOwnProfile(row) ? (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Btn size="sm" variant="secondary" icon={Edit2}
            onClick={e => { e.stopPropagation(); setEditing({ ...row }); setEditModal(true); }}>
            Edit
          </Btn>
          <Btn size="sm" variant="secondary" icon={Key}
            onClick={e => { e.stopPropagation(); setEditing({ ...row }); setPwModal(true); }}>
            Password
          </Btn>
          {profile?.role === 'admin' && !isOwnProfile(row) && (
            <Btn size="sm" variant={row.active !== false ? 'danger' : 'success'}
              icon={row.active !== false ? UserX : UserCheck}
              onClick={e => { e.stopPropagation(); handleToggleActive(row); }}>
              {row.active !== false ? 'Deactivate' : 'Activate'}
            </Btn>
          )}
        </div>
      ) : null
    )},
  ];

  return (
    <>
      <Header title="Users & Roles" />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <PageHeader
          title="Users & Roles"
          subtitle={`${users.length} users in ERP`}
          actions={[
            <Btn key="refresh" variant="secondary" icon={RefreshCw} onClick={load}>Refresh</Btn>,
            ...(profile?.role === 'admin' ? [
              <Btn key="add" icon={Plus} onClick={() => setCreateModal(true)}>Create User</Btn>
            ] : []),
          ]}
        />

        {/* Note about syncing */}
        <div style={{ background: 'var(--accent-glow)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 16px', fontSize: '13px', color: 'var(--text2)' }}>
          <strong style={{ color: 'var(--accent)' }}>Note:</strong> Users must be created here or via Firebase Authentication Console. If a user was added in Firebase but doesn't appear here, they need a Firestore profile — use <strong>Create User</strong> to add them properly.
        </div>

        {/* Role cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', gap: 12 }}>
          {ROLES.map(r => (
            <Card key={r.value} style={{ padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Shield size={14} color="var(--accent)" />
                <Badge color={r.color}>{r.label}</Badge>
              </div>
              <p style={{ fontSize: '0.72rem', color: 'var(--text3)', lineHeight: 1.5 }}>{r.desc}</p>
            </Card>
          ))}
        </div>

        {/* Users table */}
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? <Loader /> : users.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ color: 'var(--text3)', marginBottom: 16, fontSize: '14px' }}>No users found in Firestore.</div>
              <p style={{ color: 'var(--text3)', fontSize: '12px', maxWidth: 400, margin: '0 auto' }}>
                Users created via Firebase Console need to be added here using "Create User" so they get an ERP profile and role.
              </p>
            </div>
          ) : (
            <Table columns={columns} data={users} />
          )}
        </Card>
      </div>

      {/* ── Create User Modal ── */}
      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Create New User" width={480}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Input label="Full Name *" value={createForm.name} onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Ahmed Khan" />
          <Input label="Email Address *" type="email" value={createForm.email} onChange={e => setCreateForm(p => ({ ...p, email: e.target.value }))} placeholder="ahmed@sitrading.com" />
          <Input label="Password *" type="password" value={createForm.password} onChange={e => setCreateForm(p => ({ ...p, password: e.target.value }))} placeholder="Min 6 characters" />
          <Select label="Role" value={createForm.role} onChange={e => setCreateForm(p => ({ ...p, role: e.target.value }))}
            options={ROLES.map(r => ({ value: r.value, label: `${r.label} — ${r.desc.split(' — ')[0]}` }))} />
          <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '10px 12px', fontSize: '12px', color: 'var(--text3)' }}>
            The user will be able to log in immediately with these credentials.
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn variant="secondary" onClick={() => setCreateModal(false)}>Cancel</Btn>
            <Btn onClick={handleCreate} disabled={saving}>{saving ? 'Creating...' : 'Create User'}</Btn>
          </div>
        </div>
      </Modal>

      {/* ── Edit User Modal ── */}
      {editing && (
        <Modal open={editModal} onClose={() => setEditModal(false)} title={`Edit User — ${editing.name || editing.email}`} width={480}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Input label="Full Name" value={editing.name || ''} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))} />
            <Input label="Email" value={editing.email || ''} readOnly style={{ opacity: 0.6 }} />
            <Input label="Phone" value={editing.phone || ''} onChange={e => setEditing(p => ({ ...p, phone: e.target.value }))} placeholder="+92 300 0000000" />
            {profile?.role === 'admin' && (
              <>
                <Select label="Role" value={editing.role || 'viewer'} onChange={e => setEditing(p => ({ ...p, role: e.target.value }))}
                  options={ROLES.map(r => ({ value: r.value, label: r.label }))} />
                <Select label="Status" value={editing.active !== false ? 'true' : 'false'}
                  onChange={e => setEditing(p => ({ ...p, active: e.target.value === 'true' }))}
                  options={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }]} />
              </>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Btn variant="secondary" onClick={() => setEditModal(false)}>Cancel</Btn>
              <Btn onClick={handleUpdateUser} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Password Modal ── */}
      {editing && (
        <Modal open={pwModal} onClose={() => { setPwModal(false); setPwForm({ newPassword: '', confirmPassword: '' }); }} title={`Password — ${editing.name || editing.email}`} width={440}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {isOwnProfile(editing) ? (
              // Change own password directly
              <>
                <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '10px 12px', fontSize: '12px', color: 'var(--text2)' }}>
                  You are changing your own password.
                </div>
                <Input label="New Password" type="password" value={pwForm.newPassword} onChange={e => setPwForm(p => ({ ...p, newPassword: e.target.value }))} placeholder="Min 6 characters" />
                <Input label="Confirm Password" type="password" value={pwForm.confirmPassword} onChange={e => setPwForm(p => ({ ...p, confirmPassword: e.target.value }))} placeholder="Repeat new password" />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <Btn variant="secondary" onClick={() => setPwModal(false)}>Cancel</Btn>
                  <Btn onClick={handleChangeOwnPassword} disabled={saving}>{saving ? 'Updating...' : 'Update Password'}</Btn>
                </div>
              </>
            ) : (
              // Send reset email to another user
              <>
                <div style={{ fontSize: '14px', color: 'var(--text2)', lineHeight: 1.6 }}>
                  Send a password reset email to <strong style={{ color: 'var(--text)' }}>{editing.email}</strong>. They will receive a link to set a new password.
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <Btn variant="secondary" onClick={() => setPwModal(false)}>Cancel</Btn>
                  <Btn icon={Key} onClick={handlePasswordReset} disabled={saving}>{saving ? 'Sending...' : 'Send Reset Email'}</Btn>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
