// src/pages/users/Users.js
//
// Two tabs: the people who can sign in, and the roles that decide what each of
// them may do. Roles are stored in erp_roles; a user can also carry their own
// permission map when the presets do not fit.
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { getAll, create, update, remove, COLLECTIONS } from '../../lib/db';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import Header from '../../components/layout/Header';
import { Table, Btn, Modal, Input, Select, Badge, PageHeader, Card, Loader, Tabs } from '../../components/ui';
import PermissionMatrix from '../../components/ui/PermissionMatrix';
import {
  MODULES, countGrants, isLockedRole, mergeRoles, normalize,
  permissionsForRole, resolveUserPermissions, slugifyRoleKey, fullAccess,
} from '../../lib/permissions';
import toast from 'react-hot-toast';
import { Plus, Edit2, Shield, Key, RefreshCw, UserCheck, UserX, Trash2, Lock } from 'lucide-react';

const BADGE_COLORS = ['default', 'green', 'red', 'blue', 'yellow', 'purple'];

export default function Users() {
  const { register, user: currentUser, isAdmin, refreshRoles, refreshProfile } = useAuth();

  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [roleRows, setRoleRows] = useState([]);   // raw erp_roles rows (carry ids)
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Modals
  const [createModal, setCreateModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [pwModal, setPwModal] = useState(false);
  const [permModal, setPermModal] = useState(false);
  const [roleModal, setRoleModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editingRole, setEditingRole] = useState(null);

  // Forms
  const [createForm, setCreateForm] = useState({ name: '', email: '', password: '', role: 'staff' });
  const [pwForm, setPwForm] = useState({ newPassword: '', confirmPassword: '' });

  const roles = useMemo(() => mergeRoles(roleRows), [roleRows]);
  const roleOptions = useMemo(() => roles.map(r => ({ value: r.key, label: r.label })), [roles]);

  // Seeing the directory is a normal permission; changing who has access is
  // reserved for admins and enforced in the database too (migration 0002).
  const canManage = isAdmin;
  const canCreate = isAdmin;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [userRows, storedRoles] = await Promise.all([
        getAll(COLLECTIONS.USERS),
        getAll(COLLECTIONS.ROLES).catch(() => []),
      ]);
      setUsers(userRows);
      setRoleRows(storedRoles);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load users');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const isOwnProfile = (u) => u.id === currentUser?.id || u.email === currentUser?.email;
  const activeAdmins = users.filter(u => u.role === 'admin' && u.active !== false);
  const isLastAdmin = (u) => u.role === 'admin' && activeAdmins.length <= 1;

  // ── Users ─────────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!createForm.name || !createForm.email || !createForm.password) return toast.error('All fields required');
    if (createForm.password.length < 6) return toast.error('Password must be at least 6 characters');
    setSaving(true);
    try {
      await register(createForm.email.trim(), createForm.password, createForm.name.trim(), createForm.role);
      toast.success(`User "${createForm.name}" created`);
      setCreateModal(false);
      setCreateForm({ name: '', email: '', password: '', role: 'staff' });
      load();
    } catch (e) {
      const msg = e.message || '';
      if (/already registered|already been registered/i.test(msg)) toast.error('This email is already registered');
      else if (/invalid email/i.test(msg)) toast.error('Invalid email address');
      else toast.error(msg || 'Failed to create user');
    }
    setSaving(false);
  };

  const handleUpdateUser = async () => {
    if (!editing.name) return toast.error('Name is required');
    // Never leave the ERP without somebody who can hand out access.
    const original = users.find(u => u.id === editing.id);
    if (original?.role === 'admin' && editing.role !== 'admin' && activeAdmins.length <= 1) {
      return toast.error('This is the only active admin — promote someone else first');
    }
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
      if (isOwnProfile(editing)) await refreshProfile();
      load();
    } catch (e) { toast.error('Failed: ' + e.message); }
    setSaving(false);
  };

  const handleSavePermissions = async () => {
    setSaving(true);
    try {
      await update(COLLECTIONS.USERS, editing.id, {
        permissionMode: editing.permissionMode || 'role',
        permissions: normalize(editing.permissions),
      });
      toast.success('Permissions saved');
      setPermModal(false);
      if (isOwnProfile(editing)) await refreshProfile();
      load();
    } catch (e) { toast.error('Failed: ' + e.message); }
    setSaving(false);
  };

  const handlePasswordReset = async () => {
    if (!editing?.email) return;
    setSaving(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(editing.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success(`Password reset email sent to ${editing.email}`);
      setPwModal(false);
    } catch (e) { toast.error('Failed: ' + e.message); }
    setSaving(false);
  };

  const handleChangeOwnPassword = async () => {
    if (!pwForm.newPassword || pwForm.newPassword.length < 6) return toast.error('Password must be at least 6 characters');
    if (pwForm.newPassword !== pwForm.confirmPassword) return toast.error('Passwords do not match');
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwForm.newPassword });
      if (error) throw error;
      toast.success('Password updated');
      setPwModal(false);
      setPwForm({ newPassword: '', confirmPassword: '' });
    } catch (e) { toast.error('Failed: ' + e.message); }
    setSaving(false);
  };

  const handleToggleActive = async (u) => {
    if (u.active !== false && isLastAdmin(u)) {
      return toast.error('This is the only active admin — you cannot deactivate them');
    }
    try {
      await update(COLLECTIONS.USERS, u.id, { active: !(u.active !== false) });
      toast.success(u.active !== false ? 'User deactivated' : 'User activated');
      load();
    } catch (e) { toast.error('Failed: ' + e.message); }
  };

  // Removes ERP access. The Supabase Auth login itself can only be deleted
  // with a service-role key, so it is revoked here rather than erased.
  const handleRemoveUser = async (u) => {
    if (isOwnProfile(u)) return toast.error('You cannot remove your own access');
    if (isLastAdmin(u)) return toast.error('This is the only active admin');
    if (!window.confirm(
      `Remove ERP access for ${u.name || u.email}?\n\n` +
      'Their profile and permissions are deleted and they can no longer use the ERP. ' +
      'The Supabase Auth login stays until it is deleted in the Supabase dashboard.'
    )) return;
    try {
      await remove(COLLECTIONS.USERS, u.id);
      toast.success('Access removed');
      load();
    } catch (e) { toast.error('Failed: ' + e.message); }
  };

  // ── Roles ─────────────────────────────────────────────────────────────────

  const openNewRole = () => {
    setEditingRole({ key: '', label: '', description: '', color: 'purple', permissions: {}, isNew: true, builtIn: false });
    setRoleModal(true);
  };

  const handleSaveRole = async () => {
    const label = (editingRole.label || '').trim();
    if (!label) return toast.error('Role name is required');
    const key = editingRole.builtIn ? editingRole.key : (editingRole.key || slugifyRoleKey(label));
    if (!key) return toast.error('Role name must contain letters or numbers');
    if (editingRole.isNew && roles.some(r => r.key === key)) return toast.error('A role with that name already exists');
    if (!editingRole.builtIn && countGrants(editingRole.permissions) === 0) {
      return toast.error('Grant at least one permission');
    }
    setSaving(true);
    try {
      const doc = {
        key,
        label,
        description: editingRole.description || '',
        color: editingRole.color || 'purple',
        permissions: normalize(editingRole.permissions),
      };
      const existing = roleRows.find(r => r.key === key);
      if (existing) await update(COLLECTIONS.ROLES, existing.id, doc);
      else await create(COLLECTIONS.ROLES, doc);
      toast.success(`Role "${label}" saved`);
      setRoleModal(false);
      await refreshRoles();
      load();
    } catch (e) { toast.error('Failed: ' + e.message); }
    setSaving(false);
  };

  // Built-in roles cannot be deleted — deleting only drops the stored override
  // and returns them to the shipped preset.
  const handleDeleteRole = async (role) => {
    const stored = roleRows.find(r => r.key === role.key);
    if (!stored) return;
    const inUse = users.filter(u => u.role === role.key);
    if (!role.builtIn && inUse.length) {
      return toast.error(`${inUse.length} user(s) still use this role — move them first`);
    }
    const msg = role.builtIn
      ? `Reset "${role.label}" to its built-in permissions?`
      : `Delete the "${role.label}" role?`;
    if (!window.confirm(msg)) return;
    try {
      await remove(COLLECTIONS.ROLES, stored.id);
      toast.success(role.builtIn ? 'Role reset to defaults' : 'Role deleted');
      await refreshRoles();
      load();
    } catch (e) { toast.error('Failed: ' + e.message); }
  };

  // ── Table ─────────────────────────────────────────────────────────────────

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
    { key: 'role', label: 'Role', render: (v, r) => {
      const role = roles.find(x => x.key === v);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
          <Badge color={role?.color || 'default'}>{role?.label || v || 'viewer'}</Badge>
          {r.permissionMode === 'custom' && <Badge color="purple">Custom access</Badge>}
        </div>
      );
    }},
    { key: '_access', label: 'Access', render: (_, r) => {
      const perms = resolveUserPermissions(r, roles);
      const modules = Object.keys(perms).length;
      return (
        <span style={{ fontSize: '0.75rem', color: 'var(--text3)' }}>
          {r.role === 'admin'
            ? 'All modules'
            : `${modules}/${MODULES.length} modules · ${countGrants(perms)} permissions`}
        </span>
      );
    }},
    { key: 'active', label: 'Status', render: (v, r) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Badge color={v !== false ? 'green' : 'red'}>{v !== false ? 'Active' : 'Inactive'}</Badge>
        {isOwnProfile(r) && <span style={{ fontSize: '10px', color: 'var(--accent)' }}>You</span>}
      </div>
    )},
    { key: '_actions', label: '', render: (_, row) => (
      canManage || isOwnProfile(row) ? (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Btn size="sm" variant="secondary" icon={Edit2}
            onClick={e => { e.stopPropagation(); setEditing({ ...row }); setEditModal(true); }}>
            Edit
          </Btn>
          {canManage && (
            <Btn size="sm" variant="secondary" icon={Shield}
              onClick={e => {
                e.stopPropagation();
                setEditing({
                  ...row,
                  permissionMode: row.permissionMode || 'role',
                  permissions: normalize(row.permissions || permissionsForRole(row.role, roles)),
                });
                setPermModal(true);
              }}>
              Access
            </Btn>
          )}
          <Btn size="sm" variant="secondary" icon={Key}
            onClick={e => { e.stopPropagation(); setEditing({ ...row }); setPwModal(true); }}>
            Password
          </Btn>
          {canManage && !isOwnProfile(row) && (
            <>
              <Btn size="sm" variant={row.active !== false ? 'danger' : 'success'}
                icon={row.active !== false ? UserX : UserCheck}
                onClick={e => { e.stopPropagation(); handleToggleActive(row); }}>
                {row.active !== false ? 'Deactivate' : 'Activate'}
              </Btn>
              {canManage && (
                <Btn size="sm" variant="danger" icon={Trash2}
                  onClick={e => { e.stopPropagation(); handleRemoveUser(row); }}>
                  Remove
                </Btn>
              )}
            </>
          )}
        </div>
      ) : null
    )},
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <Header title="Users & Roles" />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <PageHeader
          title="Users & Roles"
          subtitle={tab === 'users'
            ? `${users.length} user${users.length === 1 ? '' : 's'} · ${activeAdmins.length} admin${activeAdmins.length === 1 ? '' : 's'}`
            : `${roles.length} roles`}
          actions={[
            <Btn key="refresh" variant="secondary" icon={RefreshCw} onClick={load}>Refresh</Btn>,
            ...(tab === 'users' && canCreate
              ? [<Btn key="add" icon={Plus} onClick={() => setCreateModal(true)}>Add User</Btn>]
              : []),
            ...(tab === 'roles' && canManage
              ? [<Btn key="role" icon={Plus} onClick={openNewRole}>New Role</Btn>]
              : []),
          ]}
        />

        <Tabs
          tabs={[{ value: 'users', label: 'Users' }, { value: 'roles', label: 'Roles & Permissions' }]}
          active={tab}
          onChange={setTab}
        />

        {tab === 'users' ? (
          <>
            <div style={{
              background: 'var(--accent-glow)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '12px 16px',
              fontSize: '13px', color: 'var(--text2)', lineHeight: 1.6,
            }}>
              <strong style={{ color: 'var(--accent)' }}>Adding people:</strong>{' '}
              use <strong>Add User</strong> to create the login and the ERP profile in one step —
              they can sign in immediately with the password you set. Give them a role for the usual
              access, or open <strong>Access</strong> to tailor permissions for that person alone.
              Someone who already exists in the Supabase Auth dashboard gets a profile automatically
              on their first sign-in, starting as a <em>Viewer</em>.
            </div>

            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {loading ? <Loader /> : users.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center' }}>
                  <div style={{ color: 'var(--text3)', marginBottom: 8, fontSize: '14px' }}>No users yet.</div>
                  <p style={{ color: 'var(--text3)', fontSize: '12px', maxWidth: 420, margin: '0 auto' }}>
                    Click “Add User” to create the first account.
                  </p>
                </div>
              ) : (
                <Table columns={columns} data={users} />
              )}
            </Card>
          </>
        ) : (
          <>
            <div style={{
              background: 'var(--accent-glow)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '12px 16px',
              fontSize: '13px', color: 'var(--text2)', lineHeight: 1.6,
            }}>
              <strong style={{ color: 'var(--accent)' }}>How access works:</strong>{' '}
              a role is a grid of modules × actions. Everyone assigned to a role inherits it, and
              changes apply the next time they load the app. Admin is fixed at full access so the
              system can always be administered.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {roles.map(role => {
                const perms = role.permissions || permissionsForRole(role.key, roles);
                const assigned = users.filter(u => u.role === role.key).length;
                const stored = roleRows.find(r => r.key === role.key);
                return (
                  <Card key={role.key} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {isLockedRole(role.key) ? <Lock size={14} color="var(--text3)" /> : <Shield size={14} color="var(--accent)" />}
                      <Badge color={role.color}>{role.label}</Badge>
                      {role.builtIn
                        ? <span style={{ fontSize: '0.65rem', color: 'var(--text3)' }}>built-in{role.customised ? ' · edited' : ''}</span>
                        : <span style={{ fontSize: '0.65rem', color: 'var(--text3)' }}>custom</span>}
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text3)', lineHeight: 1.5, flex: 1 }}>
                      {role.description || 'No description.'}
                    </p>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>
                      {isLockedRole(role.key)
                        ? 'Every module, every action'
                        : `${Object.keys(perms).length}/${MODULES.length} modules · ${countGrants(perms)} permissions`}
                      {' · '}{assigned} user{assigned === 1 ? '' : 's'}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <Btn size="sm" variant="secondary" icon={isLockedRole(role.key) || !canManage ? Shield : Edit2}
                        onClick={() => { setEditingRole({ ...role, permissions: perms, isNew: false }); setRoleModal(true); }}>
                        {isLockedRole(role.key) || !canManage ? 'View' : 'Edit'}
                      </Btn>
                      {canManage && stored && !isLockedRole(role.key) && (
                        <Btn size="sm" variant="danger" icon={Trash2} onClick={() => handleDeleteRole(role)}>
                          {role.builtIn ? 'Reset' : 'Delete'}
                        </Btn>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Add User ── */}
      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Add User" width={480}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Input label="Full Name *" value={createForm.name} onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Ahmed Khan" />
          <Input label="Email Address *" type="email" value={createForm.email} onChange={e => setCreateForm(p => ({ ...p, email: e.target.value }))} placeholder="ahmed@sitrading.com" />
          <Input label="Password *" type="password" value={createForm.password} onChange={e => setCreateForm(p => ({ ...p, password: e.target.value }))} placeholder="Min 6 characters" />
          <Select label="Role" value={createForm.role} onChange={e => setCreateForm(p => ({ ...p, role: e.target.value }))} options={roleOptions} />
          <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '10px 12px', fontSize: '12px', color: 'var(--text3)', lineHeight: 1.6 }}>
            {roles.find(r => r.key === createForm.role)?.description}
            <br />
            The user can sign in immediately with these credentials. You stay signed in.
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn variant="secondary" onClick={() => setCreateModal(false)}>Cancel</Btn>
            <Btn onClick={handleCreate} disabled={saving}>{saving ? 'Creating...' : 'Create User'}</Btn>
          </div>
        </div>
      </Modal>

      {/* ── Edit User ── */}
      {editing && (
        <Modal open={editModal} onClose={() => setEditModal(false)} title={`Edit User — ${editing.name || editing.email}`} width={480}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Input label="Full Name" value={editing.name || ''} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))} />
            <Input label="Email" value={editing.email || ''} readOnly style={{ opacity: 0.6 }} />
            <Input label="Phone" value={editing.phone || ''} onChange={e => setEditing(p => ({ ...p, phone: e.target.value }))} placeholder="+92 300 0000000" />
            {canManage && (
              <>
                <Select label="Role" value={editing.role || 'viewer'} onChange={e => setEditing(p => ({ ...p, role: e.target.value }))} options={roleOptions} />
                <Select label="Status" value={editing.active !== false ? 'true' : 'false'}
                  onChange={e => setEditing(p => ({ ...p, active: e.target.value === 'true' }))}
                  options={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }]} />
                {editing.permissionMode === 'custom' && (
                  <div style={{ fontSize: '12px', color: 'var(--text3)' }}>
                    This user has custom permissions, so the role above is a label only. Use
                    <strong> Access</strong> to switch back to role defaults.
                  </div>
                )}
              </>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Btn variant="secondary" onClick={() => setEditModal(false)}>Cancel</Btn>
              <Btn onClick={handleUpdateUser} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Per-user access ── */}
      {editing && (
        <Modal open={permModal} onClose={() => setPermModal(false)} title={`Access — ${editing.name || editing.email}`} width={720}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {editing.role === 'admin' ? (
              <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '12px 14px', fontSize: '13px', color: 'var(--text2)', lineHeight: 1.6 }}>
                Admins always have full access to every module. Change their role first if you need
                to limit what they can do.
              </div>
            ) : (
              <>
                <Select
                  label="Permission source"
                  value={editing.permissionMode || 'role'}
                  onChange={e => setEditing(p => ({
                    ...p,
                    permissionMode: e.target.value,
                    permissions: e.target.value === 'custom'
                      ? normalize(p.permissions && Object.keys(p.permissions).length ? p.permissions : permissionsForRole(p.role, roles))
                      : p.permissions,
                  }))}
                  options={[
                    { value: 'role', label: `Inherit from role — ${roles.find(r => r.key === editing.role)?.label || editing.role}` },
                    { value: 'custom', label: 'Custom permissions for this user' },
                  ]}
                />
                <PermissionMatrix
                  readOnly={editing.permissionMode !== 'custom'}
                  value={editing.permissionMode === 'custom'
                    ? editing.permissions
                    : permissionsForRole(editing.role, roles)}
                  onChange={perms => setEditing(p => ({ ...p, permissions: perms }))}
                />
              </>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Btn variant="secondary" onClick={() => setPermModal(false)}>Close</Btn>
              {editing.role !== 'admin' && (
                <Btn onClick={handleSavePermissions} disabled={saving}>{saving ? 'Saving...' : 'Save Access'}</Btn>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* ── Password ── */}
      {editing && (
        <Modal open={pwModal} onClose={() => { setPwModal(false); setPwForm({ newPassword: '', confirmPassword: '' }); }} title={`Password — ${editing.name || editing.email}`} width={440}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {isOwnProfile(editing) ? (
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

      {/* ── Role editor ── */}
      {editingRole && (
        <Modal
          open={roleModal}
          onClose={() => setRoleModal(false)}
          title={editingRole.isNew ? 'New Role' : `Role — ${editingRole.label}`}
          width={760}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {isLockedRole(editingRole.key) && (
              <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '10px 12px', fontSize: '12px', color: 'var(--text2)' }}>
                The Admin role is fixed at full access and cannot be edited — that guarantees the ERP
                always has someone who can manage users.
              </div>
            )}
            <Input
              label="Role Name"
              value={editingRole.label || ''}
              readOnly={editingRole.builtIn}
              style={editingRole.builtIn ? { opacity: 0.6 } : undefined}
              onChange={e => setEditingRole(p => ({ ...p, label: e.target.value }))}
              placeholder="e.g. Warehouse Supervisor"
            />
            <Input
              label="Description"
              value={editingRole.description || ''}
              readOnly={!canManage || isLockedRole(editingRole.key)}
              onChange={e => setEditingRole(p => ({ ...p, description: e.target.value }))}
              placeholder="What this role is for"
            />
            {!editingRole.builtIn && (
              <Select label="Badge colour" value={editingRole.color || 'purple'}
                onChange={e => setEditingRole(p => ({ ...p, color: e.target.value }))}
                options={BADGE_COLORS.map(c => ({ value: c, label: c }))} />
            )}
            <PermissionMatrix
              readOnly={!canManage || isLockedRole(editingRole.key)}
              value={isLockedRole(editingRole.key) ? fullAccess() : editingRole.permissions}
              onChange={perms => setEditingRole(p => ({ ...p, permissions: perms }))}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Btn variant="secondary" onClick={() => setRoleModal(false)}>Close</Btn>
              {canManage && !isLockedRole(editingRole.key) && (
                <Btn onClick={handleSaveRole} disabled={saving}>{saving ? 'Saving...' : 'Save Role'}</Btn>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
