import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ShieldAlert, Clock, AlertTriangle, Loader2 } from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Label } from '@/components/ui/Input';

interface AttendanceCorrectionModalProps {
  recordId: string | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export function AttendanceCorrectionModal({
  recordId,
  onClose,
  onSuccess,
}: AttendanceCorrectionModalProps) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [checkInTime, setCheckInTime] = useState('');
  const [checkOutTime, setCheckOutTime] = useState('');
  const [error, setError] = useState('');

  const correctMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, any> = {
        reason: reason.trim(),
        notes: notes.trim() || undefined,
      };

      if (checkInTime) {
        payload.checkInAt = new Date(checkInTime).toISOString();
      }
      if (checkOutTime) {
        payload.checkOutAt = new Date(checkOutTime).toISOString();
      }

      return (await api.patch(`/attendance/${recordId}/correct`, payload)).data.data;
    },
    onSuccess: () => {
      toast.success('Attendance record corrected successfully');
      qc.invalidateQueries({ queryKey: ['attendance-team'] });
      qc.invalidateQueries({ queryKey: ['attendance-summary'] });
      qc.invalidateQueries({ queryKey: ['attendance-heatmap'] });
      qc.invalidateQueries({ queryKey: ['attendance-employee-directory'] });
      qc.invalidateQueries({ queryKey: ['attendance-day-detail'] });
      onSuccess?.();
      handleClose();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const handleClose = () => {
    setReason('');
    setNotes('');
    setCheckInTime('');
    setCheckOutTime('');
    setError('');
    onClose();
  };

  const handleSubmit = () => {
    if (reason.trim().length < 3) {
      setError('Please provide a specific justification reason for the audit log.');
      return;
    }
    if (checkInTime && checkOutTime && new Date(checkOutTime) <= new Date(checkInTime)) {
      setError('Check-out timestamp must be later than check-in timestamp.');
      return;
    }
    setError('');
    correctMutation.mutate();
  };

  return (
    <Modal
      open={!!recordId}
      onClose={handleClose}
      title="Audit & Correct Attendance Record"
      description="Administrative correction tool. All modifications will be permanently recorded in the system audit log."
      size="md"
      footer={
        <div className="flex w-full items-center justify-between">
          <span className="text-[11px] text-slate-400">
            Action actor: Authenticated Executive
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleClose} disabled={correctMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={reason.trim().length < 3 || correctMutation.isPending}
              className="bg-[#0D9488] hover:bg-[#0B7D72] text-white"
            >
              {correctMutation.isPending && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              <span>Save &amp; Audit Correction</span>
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Timestamps Override */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Adjusted Check-in Time</Label>
            <Input
              type="datetime-local"
              value={checkInTime}
              onChange={(e) => setCheckInTime(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Adjusted Check-out Time</Label>
            <Input
              type="datetime-local"
              value={checkOutTime}
              onChange={(e) => setCheckOutTime(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        {/* Mandatory Reason */}
        <div>
          <Label className="text-xs">
            Reason for Correction <span className="text-red-500">*</span>
          </Label>
          <Input
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError('');
            }}
            placeholder="e.g. Employee forgot to submit check-out before leaving premises"
            className="mt-1"
          />
          <p className="mt-1 text-[11px] text-slate-400">
            A concise description is required to maintain compliance with employee records.
          </p>
        </div>

        {/* Notes */}
        <div>
          <Label className="text-xs">Additional Notes (Optional)</Label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Verified by project manager over chat sync"
            className="mt-1"
          />
        </div>
      </div>
    </Modal>
  );
}
