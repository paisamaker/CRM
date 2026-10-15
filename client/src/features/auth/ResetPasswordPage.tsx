import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Lock } from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input, Label } from '@/components/ui/Input';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/reset', { token, password });
      toast.success('Password updated successfully');
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
            <h1 className="text-xl font-bold text-slate-900">Choose New Password</h1>
            <p className="text-xs text-slate-500">Project Management &amp; Company Operations</p>
          </div>
        </div>

        <p className="text-sm text-slate-600">
          Must be at least 6 characters with one capital letter and special character.
        </p>

        <form className="mt-6 space-y-4" onSubmit={submit}>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-700">New Password</Label>
            <div className="relative mt-1.5">
              <Lock className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="h-11 rounded-lg border-slate-300 bg-white pl-10 text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/15"
                required
              />
            </div>
          </div>

          <Button
            className="h-11 w-full rounded-lg bg-indigo-600 text-sm font-semibold text-white shadow-xs hover:bg-indigo-700 active:bg-indigo-800"
            disabled={loading || !token}
          >
            {loading ? 'Updating…' : 'Save & Sign In'}
          </Button>
        </form>

        <div className="mt-6 border-t border-slate-100 pt-4 text-center">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Return to Sign In</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
