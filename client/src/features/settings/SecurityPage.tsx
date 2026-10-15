import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api, getErrorMessage } from '@/lib/api';
import { PageHeader, Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Label } from '@/components/ui/Input';
import { useAuthStore } from '@/stores/auth';

export function SecurityPage() {
  const [params] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    if (params.get('setupMfa') === '1') startMfa();
  }, [params]);

  async function startMfa() {
    try {
      const { data } = await api.post('/auth/mfa/setup');
      setQr(data.data.qrCode);
      setSecret(data.data.secret);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  async function confirmMfa() {
    try {
      const { data } = await api.post('/auth/mfa/confirm', { code });
      setBackupCodes(data.data.backupCodes);
      toast.success('MFA enabled — store your backup codes');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  async function changePassword() {
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      toast.success('Password updated');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader title="Security" description="MFA, password, and session controls" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="font-semibold">Authenticator MFA</h3>
          <p className="mt-1 text-sm text-[var(--fg-muted)]">
            Status: {user?.mfaEnabled ? 'Enabled' : 'Not enabled'}
          </p>
          {!qr ? (
            <Button className="mt-4" onClick={startMfa}>
              Set up MFA
            </Button>
          ) : (
            <div className="mt-4 space-y-3">
              <img src={qr} alt="MFA QR" className="h-40 w-40 rounded-xl border border-[var(--border)]" />
              <p className="text-xs text-[var(--fg-muted)]">Secret: {secret}</p>
              <div>
                <Label>Confirm code</Label>
                <Input value={code} onChange={(e) => setCode(e.target.value)} />
              </div>
              <Button onClick={confirmMfa}>Enable MFA</Button>
            </div>
          )}
          {backupCodes.length ? (
            <div className="mt-4 rounded-xl bg-[var(--brand-soft)] p-3 text-xs">
              <div className="mb-2 font-semibold">Backup codes (save now)</div>
              <div className="grid grid-cols-2 gap-1 font-mono">
                {backupCodes.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
            </div>
          ) : null}
        </Card>

        <Card>
          <h3 className="font-semibold">Change password</h3>
          <div className="mt-4 space-y-3">
            <div>
              <Label>Current password</Label>
              <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </div>
            <div>
              <Label>New password</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <Button onClick={changePassword}>Update password</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
