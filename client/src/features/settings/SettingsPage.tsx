import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  User,
  Upload,
  Camera,
  Sparkles,
  Trash2,
  Shield,
  Building2,
  Cloud,
  Lock,
  Phone,
  Save,
  RefreshCw,
} from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { PageHeader, Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Label } from '@/components/ui/Input';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { Badge } from '@/components/ui/Badge';
import { AvatarCropperModal } from '@/components/ui/AvatarCropperModal';
import { useAuthStore } from '@/stores/auth';
import { cn } from '@/lib/utils';

export function SettingsPage() {
  const qc = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const setPermissions = useAuthStore((s) => s.setPermissions);
  const role = currentUser?.role;

  // Active Tab: 'profile' (all users), 'company' (CEO), 'cloudinary' (CEO)
  const [activeTab, setActiveTab] = useState<'profile' | 'company' | 'cloudinary'>('profile');

  // --- Profile State ---
  const [name, setName] = useState(currentUser?.name || '');
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [designation, setDesignation] = useState(currentUser?.designation || '');
  const [department, setDepartment] = useState(currentUser?.department || '');
  const [avatarUrl, setAvatarUrl] = useState(currentUser?.avatar || '');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [cropperOpen, setCropperOpen] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [customImageUrl, setCustomImageUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync profile state when currentUser changes
  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name || '');
      setPhone(currentUser.phone || '');
      setDesignation(currentUser.designation || '');
      setDepartment(currentUser.department || '');
      setAvatarUrl(currentUser.avatar || '');
    }
  }, [currentUser]);

  // Load latest profile from API (keeps form in sync after login / refresh)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/auth/me');
        const payload = res.data.data;
        const u = payload?.user || payload;
        if (cancelled || !u) return;
        if (payload?.permissions) setPermissions(payload.permissions);
        updateUser({
          name: u.name,
          phone: u.phone,
          designation: u.designation,
          department: u.department,
          avatar: u.avatar,
          employeeId: u.employeeId,
        });
        setName(u.name || '');
        setPhone(u.phone || '');
        setDesignation(u.designation || '');
        setDepartment(u.department || '');
        setAvatarUrl(u.avatar || '');
      } catch {
        /* keep local session values */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  // --- Company Settings State (for CEO) ---
  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await api.get('/settings')).data.data,
    enabled: role === 'ceo',
  });

  const [domains, setDomains] = useState('');
  const [autoApprove, setAutoApprove] = useState(5000);
  const [alwaysCeo, setAlwaysCeo] = useState(5000);

  // Cloudinary credentials state
  const [cloudName, setCloudName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');

  useEffect(() => {
    if (settingsData?.settings) {
      setDomains((settingsData.settings.allowedDomains || []).join(', '));
      setAutoApprove(settingsData.settings.approvalRules?.autoApproveUnder ?? 5000);
      setAlwaysCeo(settingsData.settings.approvalRules?.alwaysCeoAbove ?? 5000);
      setCloudName(settingsData.settings.cloudinary?.cloudName || '');
      setApiKey(settingsData.settings.cloudinary?.apiKey || '');
      setApiSecret(settingsData.settings.cloudinary?.apiSecret || '');
    }
  }, [settingsData]);

  // Mutation: Update Profile Details
  const saveProfileMutation = useMutation({
    mutationFn: async () =>
      api.patch('/auth/profile', {
        name: name.trim(),
        phone: phone.trim(),
        designation: designation.trim(),
        department: department.trim(),
      }),
    onSuccess: (res) => {
      const updated = res.data.data.user;
      updateUser({
        name: updated.name,
        phone: updated.phone,
        designation: updated.designation,
        department: updated.department,
        avatar: updated.avatar,
        employeeId: updated.employeeId,
      });
      toast.success('Profile details saved — top bar & dashboard will show the updates');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  // Handle Avatar Image File Selection (opens interactive cropper before upload)
  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file (JPG, PNG, or WebP)');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image size must be under 10MB');
      return;
    }

    setCropFile(file);
    setCropperOpen(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Upload cropped avatar file to Cloudinary
  const handleCroppedAvatarUpload = async (croppedFile: File) => {
    setIsUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('avatar', croppedFile);

      const res = await api.post('/auth/profile/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const uploadedUrl = res.data.data.url;
      setAvatarUrl(uploadedUrl);
      setAvatarPreview(null);
      updateUser({ avatar: uploadedUrl });
      qc.invalidateQueries({ queryKey: ['my-profile'] });
      qc.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Profile photo cropped & updated successfully!');
      setCropperOpen(false);
      setCropFile(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  // Handle Direct Cloudinary / Image URL Apply
  const applyCustomAvatarUrl = async () => {
    if (!customImageUrl.trim()) return;
    try {
      setIsUploadingAvatar(true);
      const res = await api.patch('/auth/profile', {
        avatar: customImageUrl.trim(),
      });
      const updated = res.data.data.user;
      setAvatarUrl(updated.avatar);
      updateUser({ avatar: updated.avatar });
      setCustomImageUrl('');
      setShowUrlInput(false);
      toast.success('Cloudinary image URL applied to profile!');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  // Remove Avatar
  const removeAvatar = async () => {
    if (!window.confirm('Remove your profile photo and revert to initial initials?')) return;
    try {
      setIsUploadingAvatar(true);
      await api.patch('/auth/profile', { avatar: null });
      setAvatarUrl('');
      setAvatarPreview(null);
      updateUser({ avatar: undefined });
      toast.success('Profile photo removed');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  // Mutation: Save Company Settings (CEO only)
  const saveSettingsMutation = useMutation({
    mutationFn: async () =>
      api.patch('/settings', {
        allowedDomains: domains.split(',').map((d) => d.trim()).filter(Boolean),
        approvalRules: { autoApproveUnder: Number(autoApprove), alwaysCeoAbove: Number(alwaysCeo) },
      }),
    onSuccess: () => {
      toast.success('Company settings saved');
      qc.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  // Mutation: Save Cloudinary Credentials (CEO only)
  const saveCloudinaryMutation = useMutation({
    mutationFn: async () =>
      api.patch('/settings', {
        cloudinary: {
          cloudName: cloudName.trim(),
          apiKey: apiKey.trim(),
          apiSecret: apiSecret.trim(),
        },
      }),
    onSuccess: () => {
      toast.success('Cloudinary storage configuration updated successfully!');
      qc.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Settings & Profile"
        description="Update your profile photo, name, phone, and job details. Company-wide options are available to the CEO."
      />

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 rounded-xl border border-slate-200/80 bg-slate-50/70 p-1 w-fit shadow-2xs">
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={cn(
            'flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition',
            activeTab === 'profile'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          )}
        >
          <User className="h-3.5 w-3.5 text-teal-600" />
          <span>My Profile &amp; Avatar</span>
        </button>

        {role === 'ceo' && (
          <>
            <button
              type="button"
              onClick={() => setActiveTab('company')}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition',
                activeTab === 'company'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              )}
            >
              <Building2 className="h-3.5 w-3.5 text-teal-600" />
              <span>Company Preferences</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('cloudinary')}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition',
                activeTab === 'cloudinary'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              )}
            >
              <Cloud className="h-3.5 w-3.5 text-indigo-600" />
              <span>Cloudinary &amp; Storage</span>
            </button>
          </>
        )}
      </div>

      {/* =========================================================================
          TAB 1: MY PROFILE & AVATAR EDIT
          ========================================================================= */}
      {activeTab === 'profile' && (
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left Column: Cloudinary Avatar Photo Card */}
          <div className="lg:col-span-5">
            <Card className="p-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-5">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Profile Picture</h3>
                  <p className="text-xs text-slate-500">
                    Uploaded and hosted via Cloudinary CDN.
                  </p>
                </div>
                <Badge tone="teal" className="text-[10px]">
                  <Cloud className="mr-1 h-3 w-3" />
                  Cloudinary
                </Badge>
              </div>

              {/* Avatar Preview Section */}
              <div className="flex flex-col items-center justify-center text-center">
                <div className="relative group">
                  <div className="relative h-28 w-28 overflow-hidden rounded-3xl border-2 border-teal-500/30 p-1 shadow-md bg-white">
                    {avatarPreview ? (
                      <img
                        src={avatarPreview}
                        alt="Preview"
                        className="h-full w-full rounded-2xl object-cover"
                      />
                    ) : (
                      <UserAvatar
                        name={currentUser?.name}
                        avatar={avatarUrl}
                        className="h-full w-full rounded-2xl text-2xl shadow-inner"
                      />
                    )}

                    {isUploadingAvatar && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-900/50 backdrop-blur-xs text-white">
                        <RefreshCw className="h-6 w-6 animate-spin text-teal-400" />
                      </div>
                    )}
                  </div>

                  {/* Camera overlay shortcut */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingAvatar}
                    className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-xl bg-teal-600 text-white shadow-md hover:bg-teal-700 transition"
                    title="Change photo"
                  >
                    <Camera className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-3">
                  <h4 className="text-sm font-bold text-slate-900">{name || currentUser?.name}</h4>
                  <p className="text-xs text-slate-500">{currentUser?.email}</p>
                </div>

                {/* Hidden File Input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleAvatarFileChange}
                  className="hidden"
                />

                {/* Action Buttons */}
                <div className="mt-5 flex flex-col gap-2 w-full max-w-xs">
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingAvatar}
                    className="w-full bg-[#0D9488] hover:bg-[#0B7D72] text-white text-xs shadow-xs flex items-center justify-center gap-1.5"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>Upload New Photo</span>
                  </Button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowUrlInput(!showUrlInput)}
                      className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                    >
                      {showUrlInput ? 'Hide URL' : 'Paste Cloudinary URL'}
                    </button>

                    {avatarUrl && (
                      <button
                        type="button"
                        onClick={removeAvatar}
                        disabled={isUploadingAvatar}
                        className="rounded-xl border border-rose-200 bg-rose-50/70 p-2 text-rose-700 hover:bg-rose-100 transition"
                        title="Remove photo"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {/* Direct Cloudinary URL Input */}
                  {showUrlInput && (
                    <div className="mt-2 space-y-2 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 text-left">
                      <Label className="text-[11px] font-semibold text-indigo-900">
                        Direct Cloudinary Image Link
                      </Label>
                      <Input
                        value={customImageUrl}
                        onChange={(e) => setCustomImageUrl(e.target.value)}
                        placeholder="https://res.cloudinary.com/.../avatar.jpg"
                        className="bg-white text-xs"
                      />
                      <Button
                        size="sm"
                        onClick={applyCustomAvatarUrl}
                        disabled={!customImageUrl.trim() || isUploadingAvatar}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
                      >
                        Apply Cloudinary URL
                      </Button>
                    </div>
                  )}
                </div>

                <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3 text-left text-[11px] text-slate-500 space-y-1">
                  <div className="font-semibold text-slate-700 flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-teal-600" />
                    <span>Cloudinary Optimization:</span>
                  </div>
                  <p>
                    Uploaded images are automatically scaled, face-cropped to 400x400, and delivered
                    via global high-speed CDN.
                  </p>
                </div>
              </div>
            </Card>
          </div>

          {/* Right Column: Personal Information Form */}
          <div className="lg:col-span-7">
            <Card className="p-6">
              <div className="border-b border-slate-100 pb-3 mb-5">
                <h3 className="text-sm font-bold text-slate-900">Personal Information</h3>
                <p className="text-xs text-slate-500">
                  Update your contact details, designation, and employment profile.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <Label className="text-xs font-semibold">Full Name *</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your legal or preferred name"
                    className="mt-1 text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-semibold">Work Email</Label>
                    <div className="relative mt-1">
                      <Input
                        value={currentUser?.email || ''}
                        disabled
                        className="bg-slate-50 text-slate-500 text-xs pr-8"
                      />
                      <Lock className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    </div>
                    <span className="text-[10px] text-slate-400 mt-0.5 block">Managed by workspace SSO</span>
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">Employee ID</Label>
                    <div className="relative mt-1">
                      <Input
                        value={currentUser?.employeeId || 'Auto Assigned'}
                        disabled
                        className="bg-slate-50 text-slate-500 text-xs"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-semibold">Department</Label>
                    <Input
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      placeholder="e.g. Creative, Development"
                      className="mt-1 text-xs"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">Designation / Role Title</Label>
                    <Input
                      value={designation}
                      onChange={(e) => setDesignation(e.target.value)}
                      placeholder="e.g. Lead Designer, Operations Manager"
                      className="mt-1 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-semibold">Phone Number</Label>
                  <div className="relative mt-1">
                    <Phone className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 9876543210"
                      className="pl-9 text-xs"
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-slate-700">Account Access Level:</span>
                    <span className="ml-1.5 capitalize font-bold text-teal-800">{role}</span>
                  </div>
                  <Badge tone="teal" className="text-[10px] capitalize">
                    {currentUser?.role || 'Staff'}
                  </Badge>
                </div>

                <div className="pt-2 flex flex-wrap items-center gap-2">
                  <Button
                    onClick={() => saveProfileMutation.mutate()}
                    disabled={!name.trim() || saveProfileMutation.isPending}
                    className="bg-[#0D9488] hover:bg-[#0B7D72] text-white text-xs shadow-xs flex items-center gap-1.5"
                  >
                    <Save className="h-3.5 w-3.5" />
                    <span>{saveProfileMutation.isPending ? 'Saving...' : 'Save Profile Changes'}</span>
                  </Button>
                  <Link
                    to="/security"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    <Shield className="h-3.5 w-3.5 text-slate-500" />
                    Password &amp; MFA
                  </Link>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: COMPANY PREFERENCES (CEO ONLY)
          ========================================================================= */}
      {activeTab === 'company' && role === 'ceo' && (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h3 className="font-bold text-sm text-slate-900">Allowed Email Domains</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Only users with matching email domains can log in or receive employee invites.
              </p>
              <div className="mt-4">
                <Label className="text-xs font-semibold">Domains (comma-separated)</Label>
                <Input
                  value={domains}
                  onChange={(e) => setDomains(e.target.value)}
                  className="mt-1 text-xs"
                  placeholder="starmediainfluencer.com, starmedia.in"
                />
              </div>
            </Card>

            <Card>
              <h3 className="font-bold text-sm text-slate-900">Financial Approval Rules</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Automated threshold gates for transactions and vendor invoices.
              </p>
              <div className="mt-4 space-y-3">
                <div>
                  <Label className="text-xs font-semibold">Auto-Approve Under (INR)</Label>
                  <Input
                    type="number"
                    value={autoApprove}
                    onChange={(e) => setAutoApprove(Number(e.target.value))}
                    className="mt-1 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Always Require CEO Above (INR)</Label>
                  <Input
                    type="number"
                    value={alwaysCeo}
                    onChange={(e) => setAlwaysCeo(Number(e.target.value))}
                    className="mt-1 text-xs"
                  />
                </div>
              </div>
            </Card>

            <Card>
              <h3 className="font-bold text-sm text-slate-900">Password &amp; Security Policy</h3>
              <ul className="mt-3 space-y-1.5 text-xs text-slate-600">
                <li className="flex justify-between border-b border-slate-100 py-1">
                  <span>Minimum Length:</span>
                  <strong className="text-slate-900">
                    {settingsData?.settings?.passwordPolicy?.minLength ?? 6} chars
                  </strong>
                </li>
                <li className="flex justify-between border-b border-slate-100 py-1">
                  <span>Requires Capital Letter:</span>
                  <strong className="text-slate-900">
                    {settingsData?.settings?.passwordPolicy?.requireUpper ? 'Yes' : 'No'}
                  </strong>
                </li>
                <li className="flex justify-between border-b border-slate-100 py-1">
                  <span>Lockout Attempts:</span>
                  <strong className="text-slate-900">
                    {settingsData?.settings?.passwordPolicy?.maxFailedAttempts ?? 5} attempts
                  </strong>
                </li>
              </ul>
            </Card>

            <Card>
              <h3 className="font-bold text-sm text-slate-900">Company Identity</h3>
              <div className="mt-3 space-y-1 text-xs text-slate-600">
                <div className="font-bold text-slate-900 text-sm">
                  {settingsData?.settings?.company?.name || 'STAR MEDIA'}
                </div>
                <div>
                  Default Currency: {settingsData?.settings?.company?.currency || 'INR'} &bull; Timezone:{' '}
                  {settingsData?.settings?.company?.timezone || 'Asia/Kolkata'}
                </div>
              </div>
            </Card>
          </div>

          <Button
            onClick={() => saveSettingsMutation.mutate()}
            disabled={saveSettingsMutation.isPending}
            className="bg-[#0D9488] hover:bg-[#0B7D72] text-white text-xs shadow-xs"
          >
            {saveSettingsMutation.isPending ? 'Saving...' : 'Save Company Settings'}
          </Button>
        </div>
      )}

      {/* =========================================================================
          TAB 3: CLOUDINARY & STORAGE SETTINGS (CEO ONLY)
          ========================================================================= */}
      {activeTab === 'cloudinary' && role === 'ceo' && (
        <div className="max-w-2xl space-y-6">
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Cloudinary Media Storage</h3>
                <p className="text-xs text-slate-500">
                  Configure Cloudinary API keys to store employee profile pictures, avatars, and assets.
                </p>
              </div>
              <Badge tone="teal" className="text-xs">
                <Cloud className="mr-1 h-3.5 w-3.5" />
                CDN Media
              </Badge>
            </div>

            <div className="space-y-3.5">
              <div>
                <Label className="text-xs font-semibold">Cloud Name *</Label>
                <Input
                  value={cloudName}
                  onChange={(e) => setCloudName(e.target.value)}
                  placeholder="e.g. starmedia-cdn"
                  className="mt-1 text-xs"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">API Key *</Label>
                <Input
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="e.g. 123456789012345"
                  className="mt-1 text-xs"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">API Secret *</Label>
                <Input
                  type="password"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                  className="mt-1 text-xs"
                />
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5 text-xs text-slate-600 space-y-1.5">
                <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-teal-600" />
                  <span>How Cloudinary Works in STAR MEDIA CRM:</span>
                </div>
                <p>
                  1. When users upload avatars or photos, the backend sends them to your Cloudinary cloud.
                </p>
                <p>
                  2. Face detection auto-centers profile photos at 400x400 with automatic format compression.
                </p>
                <p>
                  3. If Cloudinary credentials are empty, images will seamlessly fallback to secure local storage.
                </p>
              </div>

              <div className="pt-2">
                <Button
                  onClick={() => saveCloudinaryMutation.mutate()}
                  disabled={saveCloudinaryMutation.isPending}
                  className="bg-[#0D9488] hover:bg-[#0B7D72] text-white text-xs shadow-xs flex items-center gap-1.5"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>
                    {saveCloudinaryMutation.isPending ? 'Saving...' : 'Save Cloudinary Credentials'}
                  </span>
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Profile Photo Cropper & Position Adjuster Modal */}
      <AvatarCropperModal
        open={cropperOpen}
        imageFile={cropFile}
        onClose={() => {
          setCropperOpen(false);
          setCropFile(null);
        }}
        onCropComplete={handleCroppedAvatarUpload}
        isUploading={isUploadingAvatar}
      />
    </div>
  );
}
