import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { User, Lock } from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input, Label } from '@/components/ui/Input';

export function AcceptInvitePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/invite/accept', { token, name, password });
      toast.success('Invite accepted — you can sign in now');
      navigate('/login');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50/80 p-6 font-sans text-slate-900">
      {/* Ambient background colors */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 -left-20 h-96 w-96 rounded-full bg-rose-400/20 blur-[120px]" />
        <div className="absolute -bottom-24 -right-20 h-96 w-96 rounded-full bg-indigo-400/20 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-md rounded-3xl border border-slate-200/80 bg-white/95 p-8 shadow-xl shadow-slate-200/60 backdrop-blur-xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xs">
            <img src="/images/starmedia_logo.webp" alt="Logo" className="h-full w-full object-contain" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Accept Invitation</h1>
            <p className="text-xs text-slate-500">Project Management &amp; Company Operations</p>
          </div>
        </div>

        <p className="text-sm text-slate-600">
          Set up your profile to join your organization's workspace.
        </p>

        <form className="mt-6 space-y-4" onSubmit={submit}>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-700">Full Name</Label>
            <div className="relative mt-1.5">
              <User className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                className="h-11 rounded-lg border-slate-300 bg-white pl-10 text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/15"
                required
              />
            </div>
          </div>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-700">Choose Password</Label>
            <div className="relative mt-1.5">
              <Lock className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="h-11 rounded-lg border-slate-300 bg-white pl-10 text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/15"
                required
              />
            </div>
          </div>
          <Button
            className="h-11 w-full rounded-lg bg-indigo-600 text-sm font-semibold text-white shadow-xs hover:bg-indigo-700 active:bg-indigo-800"
            disabled={loading || !token}
          >
            {loading ? 'Activating account…' : 'Complete Setup & Sign In'}
          </Button>
        </form>
      </div>
    </div>
  );
}
