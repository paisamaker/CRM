import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { Button } from '@/components/ui/Button';
import { Input, Label } from '@/components/ui/Input';

const schema = z.object({
  email: z.string().email('Please enter a valid work email'),
  password: z.string().min(1, 'Password is required'),
});

type Form = z.infer<typeof schema>;

export function LoginPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const setPermissions = useAuthStore((s) => s.setPermissions);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailReadOnly, setEmailReadOnly] = useState(true);
  const [passwordReadOnly, setPasswordReadOnly] = useState(true);

  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  // If already authenticated, redirect directly to dashboard
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (accessToken && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [accessToken, user, navigate]);

  // Ensure fields are completely blank on mount and clear any delayed browser autofill
  useEffect(() => {
    form.reset({ email: '', password: '' });
    const timer = setTimeout(() => {
      form.setValue('email', '');
      form.setValue('password', '');
    }, 100);
    return () => clearTimeout(timer);
  }, [form]);

  async function onSubmit(values: Form) {
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', values);
      const payload = data.data;

      if (payload.requiresMfa) {
        navigate('/mfa', { state: { tempToken: payload.tempToken } });
        return;
      }

      setSession(payload.accessToken, payload.user);
      try {
        const me = await api.get('/auth/me');
        if (me?.data?.data?.permissions) {
          setPermissions(me.data.data.permissions);
        }
      } catch {
        // Ignore permissions fetch error and continue to dashboard
      }

      toast.success(`Welcome back, ${payload.user.name}`);
      // Always open dashboard after login
      navigate('/dashboard', { replace: true });
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50/80 font-sans text-slate-900 lg:grid lg:grid-cols-12">
      {/* Elegant Ambient Light Color Effect in Background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Soft Red / Coral ambient glow (matching Star Media Red) */}
        <div className="absolute -top-28 -left-20 h-[520px] w-[520px] rounded-full bg-rose-400/20 blur-[130px]" />
        {/* Soft Indigo / Violet ambient glow */}
        <div className="absolute top-1/4 -right-28 h-[580px] w-[580px] rounded-full bg-indigo-400/20 blur-[140px]" />
        {/* Soft Amber / Peach warm glow */}
        <div className="absolute -bottom-24 left-1/3 h-[520px] w-[520px] rounded-full bg-amber-300/20 blur-[130px]" />
        {/* Soft Teal light glow */}
        <div className="absolute bottom-12 left-10 h-[400px] w-[400px] rounded-full bg-teal-400/15 blur-[120px]" />
        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, #0f172a 1px, transparent 0)',
            backgroundSize: '32px 32px',
          }}
        />
      </div>

      {/* Left Column: Professional Overview & Showcase (7 cols) */}
      <div className="relative hidden flex-col justify-between border-r border-slate-200/80 bg-slate-50/60 p-10 backdrop-blur-xl lg:col-span-7 lg:flex xl:p-14">
        {/* Brand Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-slate-200/90 bg-white p-1 shadow-sm">
              <img
                src="/images/starmedia_logo.webp"
                alt="Star Media Logo"
                className="h-full w-full object-contain"
              />
            </div>
            <div>
              <div className="text-base font-bold tracking-tight text-slate-900">STAR MEDIA</div>
              <p className="text-xs font-medium text-slate-500">Project Management &amp; Company Operations</p>
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/80 px-3 py-1 text-xs font-medium text-slate-600 shadow-xs backdrop-blur-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>Systems Normal</span>
          </div>
        </div>

        {/* Center: Hero Information & Clean Preview */}
        <div className="my-auto py-8">
          <div className="max-w-xl space-y-3">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 lg:text-4xl">
              Project Management &amp; Company Operations
            </h1>
            <p className="text-base leading-relaxed text-slate-600">
              Streamline project workflows, team tasks, company operations, automated invoicing, and multi-tier payment approvals in one unified platform.
            </p>
          </div>

          {/* Clean Dashboard Preview */}
          <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200/90 bg-white/80 p-2.5 shadow-lg shadow-slate-200/50 backdrop-blur-md">
            <img
              src="/images/saas_dashboard_hero.jpg"
              alt="Star Media CRM Platform"
              className="w-full rounded-xl object-cover"
            />
          </div>
        </div>

        {/* Bottom Feature Highlights */}
        <div className="flex flex-wrap items-center gap-6 border-t border-slate-200/80 pt-6 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-rose-500" />
            <span>Project &amp; Task Workflows</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-indigo-600" />
            <span>Automated TDS &amp; GST Invoicing</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>Role-Based Operational Approvals</span>
          </div>
        </div>
      </div>

      {/* Right Column: Clean Light Form (5 cols) */}
      <div className="relative flex min-h-screen flex-col justify-center px-6 py-12 lg:col-span-5 lg:px-10 xl:px-14">
        <div className="mx-auto w-full max-w-md rounded-3xl border border-slate-200/80 bg-white/90 p-8 shadow-xl shadow-slate-200/60 backdrop-blur-xl sm:p-10">
          {/* Logo & Brand Title */}
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xs">
              <img
                src="/images/starmedia_logo.webp"
                alt="Logo"
                className="h-full w-full object-contain"
              />
            </div>
            <div>
              <div className="text-base font-bold text-slate-900">STAR MEDIA</div>
              <div className="text-xs text-slate-500">Project Management &amp; Company Operations</div>
            </div>
          </div>

          {/* Form Header */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">
              Sign in to your account
            </h2>
            <p className="mt-1.5 text-sm text-slate-500">
              Enter your work email and password to access your workspace.
            </p>
          </div>

          {/* Sign In Form with autocomplete disabled */}
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)} autoComplete="off">
            {/* Decoy hidden inputs to deflect aggressive browser credential autofill */}
            <input type="text" name="prevent_autofill_user" tabIndex={-1} aria-hidden="true" className="hidden" />
            <input type="password" name="prevent_autofill_pwd" tabIndex={-1} aria-hidden="true" className="hidden" />

            <div>
              <Label htmlFor="email" required className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                Work Email
              </Label>
              <div className="relative mt-1.5">
                <Mail className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="name@company.com"
                  readOnly={emailReadOnly}
                  onFocus={() => setEmailReadOnly(false)}
                  autoComplete="off"
                  className="h-11 rounded-lg border-slate-300 bg-white pl-10 text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/15"
                  {...form.register('email')}
                />
              </div>
              {form.formState.errors.email && (
                <p className="mt-1.5 text-xs text-rose-600">{form.formState.errors.email.message}</p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="password" required className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Password
                </Label>
                <Link
                  to="/forgot-password"
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative mt-1.5">
                <Lock className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : passwordReadOnly ? 'text' : 'password'}
                  style={!showPassword && passwordReadOnly ? ({ WebkitTextSecurity: 'disc' } as React.CSSProperties) : undefined}
                  placeholder="••••••••••••"
                  onFocus={() => {
                    setPasswordReadOnly(false);
                  }}
                  autoComplete="new-password"
                  className="h-11 rounded-lg border-slate-300 bg-white pl-10 pr-10 text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/15"
                  {...form.register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                  title={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {form.formState.errors.password && (
                <p className="mt-1.5 text-xs text-rose-600">{form.formState.errors.password.message}</p>
              )}
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={loading}
              className="mt-2 h-11 w-full rounded-lg bg-indigo-600 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-700 active:bg-indigo-800"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Signing in…
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <span>Sign in</span>
                  <ArrowRight className="h-4 w-4" />
                </span>
              )}
            </Button>
          </form>

          {/* Security & Copyright Footer */}
          <div className="mt-8 border-t border-slate-100 pt-5 text-center">
            <p className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span>Encrypted connection &middot; Star Media Security</span>
            </p>
            <p className="mt-2 text-[11px] text-slate-400">
              &copy; {new Date().getFullYear()} Star Media. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
